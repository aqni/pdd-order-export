import { expect, test, vi } from "vitest";
import { CollectionSession } from "../../src/session";
import type { ExportOptions } from "../../src/collect";
import type { Order } from "../../src/pdd";

const options: ExportOptions = {
  startDate: "",
  endDate: "",
  pageSize: 10,
  maxPages: 10,
  includeDetails: true,
};
const order: Order = { order_sn: "261017-a", offset: "cursor:261017-a" };

test("a failing observer cannot stop collection, and invalid retries preserve the previous result", async () => {
  const source = {
    getOrders: vi.fn().mockResolvedValueOnce([order]).mockResolvedValueOnce([]),
    getOrderDetail: vi.fn(async (id: string) => ({ orderSn: id })),
  };
  const session = new CollectionSession(
    () => {
      throw new Error("render failed");
    },
    { source: () => source },
  );
  await expect(session.collect(options)).resolves.toBeUndefined();
  const previous = session.state;
  expect(previous).toMatchObject({
    phase: "ready",
    result: { complete: true },
  });
  await session.collect({ ...options, pageSize: 0 });
  expect(session.state).toMatchObject({
    phase: "failed",
    result: "result" in previous ? previous.result : null,
  });
  expect(source.getOrders).toHaveBeenCalledTimes(2);
});

test("cancel aborts the active request, rejects concurrent work and keeps a late successful detail", async () => {
  let resolve!: (detail: { orderSn: string }) => void;
  let signal!: AbortSignal;
  const source = {
    getOrders: vi.fn(async () => [order]),
    getOrderDetail: vi.fn((_id: string, active: AbortSignal) => {
      signal = active;
      return new Promise<{ orderSn: string }>((done) => {
        resolve = done;
      });
    }),
  };
  const session = new CollectionSession(() => {}, { source: () => source });
  const pending = session.collect(options);
  await vi.waitFor(() => expect(source.getOrderDetail).toHaveBeenCalledOnce());
  await session.collect(options);
  session.cancel();
  expect(signal.aborted).toBe(true);
  expect(session.state).toEqual({ phase: "cancelling" });
  resolve({ orderSn: order.order_sn });
  await pending;
  expect(session.state).toMatchObject({
    phase: "ready",
    result: {
      reason: "cancelled",
      entries: [{ detail: { orderSn: order.order_sn } }],
    },
  });
  expect(source.getOrders).toHaveBeenCalledOnce();
});

test("destroying a session is irreversible and suppresses a late page", async () => {
  let resolve!: (page: Order[]) => void;
  let signal!: AbortSignal;
  const source = {
    getOrders: vi.fn(
      (_offset: string | null, _size: number, active: AbortSignal) => {
        signal = active;
        return new Promise<Order[]>((done) => {
          resolve = done;
        });
      },
    ),
    getOrderDetail: vi.fn(),
  };
  const notify = vi.fn();
  const session = new CollectionSession(notify, { source: () => source });
  const pending = session.collect(options);
  await vi.waitFor(() => expect(source.getOrders).toHaveBeenCalledOnce());
  session.dispose();
  const notifications = notify.mock.calls.length;
  resolve([order]);
  await pending;
  await session.collect(options);
  expect(signal.aborted).toBe(true);
  expect(session.state).toEqual({ phase: "disposed" });
  expect(notify).toHaveBeenCalledTimes(notifications);
  expect(source.getOrders).toHaveBeenCalledOnce();
  expect(source.getOrderDetail).not.toHaveBeenCalled();
});
