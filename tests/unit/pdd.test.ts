// @vitest-environment jsdom
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { PddClient } from "../../src/pdd";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("scheduler", {
    postTask(
      callback: () => unknown,
      { delay = 0, signal }: SchedulerPostTaskOptions = {},
    ) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        const abort = () => {
          clearTimeout(timer);
          reject(signal!.reason);
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", abort);
          try {
            resolve(callback());
          } catch (error) {
            reject(error);
          }
        }, delay);
        signal?.addEventListener("abort", abort, { once: true });
      });
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const client = (fetch: typeof globalThis.fetch) =>
  new PddClient({ fetch, cookies: () => "pdd_user_id=123" });

test("retries only transport/server failures, preserving the original request across attempts", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ orders: [] }));
  const signal = new AbortController().signal;
  const pending = client(fetcher).getOrders("opaque", 10, signal);
  await vi.runAllTimersAsync();
  expect(await pending).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(3);
  for (const [, request] of fetcher.mock.calls) {
    expect(request).toMatchObject({
      signal,
      credentials: "include",
      redirect: "error",
      method: "POST",
      body: '{"size":10,"offset":"opaque"}',
    });
  }
  expect(vi.getTimerCount()).toBe(0);
});

test("aborting backoff settles immediately and leaves no retry timer or request behind", async () => {
  const controller = new AbortController();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 503 }));
  const pending = expect(
    client(fetcher).getOrders(null, 10, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(600);
  expect(fetcher).toHaveBeenCalledOnce();
  controller.abort();
  await pending;
  expect(vi.getTimerCount()).toBe(0);
  expect(fetcher).toHaveBeenCalledOnce();
});

test("an HTML detail for a different order and a login failure both stop without retrying", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        '<script>window.rawData={"data":{"orderSn":"wrong"}};</script>',
      ),
    );
  const wrong = expect(
    client(fetcher).getOrderDetail("261017-a", new AbortController().signal),
  ).rejects.toMatchObject({ code: "schema" });
  await vi.runAllTimersAsync();
  await wrong;
  fetcher.mockResolvedValueOnce(
    new Response("private error body", { status: 401 }),
  );
  const denied = expect(
    client(fetcher).getOrders(null, 10, new AbortController().signal),
  ).rejects.toMatchObject({ code: "session" });
  await vi.runAllTimersAsync();
  await denied;
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    () => new PddClient({ cookies: () => "pdd_user_id=1; pdd_user_id=2" }),
  ).toThrow();
});

test("rejects JavaScript expressions inside rawData without executing them", async () => {
  vi.stubGlobal("__pddProbe", false);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(
        '<script>window.rawData={"data":{"orderSn":"' +
          "261017-a" +
          '","probe":(globalThis.__pddProbe=true)}};</script>',
      ),
    );
  const pending = expect(
    client(fetcher).getOrderDetail("261017-a", new AbortController().signal),
  ).rejects.toMatchObject({ code: "schema" });
  await vi.runAllTimersAsync();
  await pending;
  expect(Reflect.get(globalThis, "__pddProbe")).toBe(false);
  expect(fetcher).toHaveBeenCalledOnce();
});
