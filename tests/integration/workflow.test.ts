// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://mobile.pinduoduo.com/orders.html"}
import { Blob } from "node:buffer";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { PddClient } from "../../src/pdd";
import { collectOrders, type CollectedOrder } from "../../src/collect";
import { exportFile } from "../../src/export";
import sample from "../fixtures/orders/reviewed-orders/collected.json" with { type: "json" };

async function drain(pages: ReturnType<typeof collectOrders>) {
  const entries: CollectedOrder[] = [];
  for await (const page of pages)
    for await (const entry of page) entries.push(entry);
  return entries;
}

const options = {
  ...sample.options,
  startDate: sample.options.startDate
    ? new Date(sample.options.startDate)
    : null,
  endDate: sample.options.endDate ? new Date(sample.options.endDate) : null,
};

const pages = [sample.entries.slice(0, 2), sample.entries.slice(2)].map(
  (entries) => ({ orders: entries.map((entry) => entry.order) }),
);

beforeEach(() => {
  vi.stubGlobal("Blob", Blob);
  // Timing and cancellation belong to the client tests; replay without delays here.
  vi.stubGlobal("scheduler", {
    postTask: async (callback: () => unknown) => callback(),
  });
});
afterEach(() => {
  document.cookie = "pdd_user_id=; Max-Age=0; Path=/";
  vi.unstubAllGlobals();
});
const client = (fetch: typeof globalThis.fetch) => {
  vi.stubGlobal("fetch", fetch);
  document.cookie = "pdd_user_id=123; Path=/";
  return new PddClient();
};

test("reviewed pages cross protocol validation, collection and both export formats without losing raw fields", async () => {
  let page = 0;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), "https://mobile.pinduoduo.com");
    if (init?.method === "POST") {
      expect(JSON.parse(String(init.body))).toEqual(
        page === 0
          ? { size: 50 }
          : {
              size: 50,
              offset: pages[page - 1]!.orders.at(-1)!.offset,
            },
      );
      return Response.json(pages[page++] ?? { orders: [] });
    }
    const entry = sample.entries.find(
      (entry) => entry.order.order_sn === url.searchParams.get("order_sn"),
    )!;
    return new Response(
      "<script>unrelated(</script><script>window.rawData=" +
        JSON.stringify({ data: entry.detail }) +
        ";</script>",
    );
  });
  const result = await drain(
    collectOrders(
      client(fetcher),
      { ...options, pageSize: 50 },
      new AbortController().signal,
    ),
  );

  expect(result.map((entry) => entry.order)).toEqual(
    sample.entries.map((entry) => entry.order),
  );
  expect(result.map((entry) => entry.detail)).toEqual(
    sample.entries.map((entry) => entry.detail),
  );
  expect(
    JSON.parse(
      await exportFile(
        result,
        "json",
        options.startDate,
        options.endDate,
      ).blob.text(),
    ),
  ).toEqual(result);
  expect(
    await exportFile(
      result,
      "csv",
      options.startDate,
      options.endDate,
    ).blob.text(),
  ).toContain(result[0]!.order.order_sn);
  expect(fetcher).toHaveBeenCalledTimes(6);
});

// Mutate reviewed responses instead of constructing an unrelated toy protocol.
test.each(["missing cursor", "invalid list"] as const)(
  "rejects a successful HTTP response with %s without returning a partial result",
  async (defect) => {
    const broken = structuredClone(pages[1]!) as Record<string, unknown>;
    if (defect === "missing cursor") {
      const orders = broken.orders as Record<string, unknown>[];
      delete orders[0]!.offset;
    } else {
      broken.orders = null;
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(pages[0]!))
      .mockResolvedValueOnce(Response.json(broken));
    const pending = drain(
      collectOrders(
        client(fetcher),
        { ...options, includeDetails: false },
        new AbortController().signal,
      ),
    );

    await expect(pending).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);
