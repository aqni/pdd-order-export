import { expect, test, vi } from "vitest";
import { collectOrders, validateOptions } from "../../src/collect";
import { PddError, type Order } from "../../src/pdd";
import type { CollectionEvent, ExportOptions } from "../../src/collect";

const options: ExportOptions = {
  startDate: "",
  endDate: "",
  pageSize: 10,
  maxPages: 10,
  includeDetails: true,
};
function order(id = "261017-a", fields: Record<string, unknown> = {}): Order {
  return { order_sn: id, offset: "cursor:" + id, ...fields };
}
async function drain(stream: AsyncIterable<CollectionEvent>) {
  const events: CollectionEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  const terminal = events.at(-1);
  if (terminal?.type !== "result") {
    throw new Error("Stream has no final result");
  }
  return { events, result: terminal.result };
}

function source(pages: Order[][]) {
  let index = 0;
  return {
    getOrders: vi.fn(async () => pages[index++] ?? []),
    getOrderDetail: vi.fn(async (id: string) => ({ orderSn: id, marker: id })),
  };
}

test("descending dates stop within the page, preserving inclusive bounds and opaque cursors", async () => {
  const newer = order("261018-new");
  const first = order("261017-a", { offset: "opaque/not-an-order-id" });
  const last = order("261016-b");
  const api = source([
    [newer, first],
    [last, order("261015-old"), order("261014-unvisited")],
  ]);
  const signal = new AbortController().signal;
  const { events, result } = await drain(
    collectOrders(
      api,
      { ...options, startDate: "2026-10-16", endDate: "2026-10-17" },
      signal,
    ),
  );
  expect(api.getOrders.mock.calls).toEqual([
    [null, 10, signal],
    [first.offset, 10, signal],
  ]);
  expect(result).toMatchObject({
    complete: true,
    reason: "range",
    progress: { pages: 2, scanned: 4, selected: 2 },
  });
  expect(result.entries.map((entry) => entry.order.order_sn)).toEqual([
    first.order_sn,
    last.order_sn,
  ]);
  expect(api.getOrderDetail.mock.calls.map(([id]) => id)).toEqual([
    first.order_sn,
    last.order_sn,
  ]);
  expect(events.filter((event) => event.type === "result")).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: "progress", progress: { pages: 0 } });
});

test("cancelling at a yield keeps the whole received page and starts no detail request", async () => {
  const controller = new AbortController();
  const page = [order("261017-a"), order("261017-b")];
  const api = source([page]);
  const stream = collectOrders(api, options, controller.signal);
  await stream.next();
  const received = await stream.next();
  expect(received.value).toMatchObject({
    type: "progress",
    progress: { selected: 2 },
  });
  controller.abort();
  const { result } = await drain(stream);
  expect(result).toMatchObject({ reason: "cancelled", complete: false });
  expect(result.entries.map((entry) => entry.order)).toEqual(page);
  expect(api.getOrderDetail).not.toHaveBeenCalled();
});

test("one broken detail stops the task without dropping its siblings or earlier detail", async () => {
  const api = source([
    [order("261017-a"), order("261017-b"), order("261017-c")],
  ]);
  api.getOrderDetail
    .mockResolvedValueOnce({ orderSn: "261017-a", marker: "kept" })
    .mockRejectedValueOnce(new PddError("详情不可用"));
  const { result } = await drain(
    collectOrders(api, options, new AbortController().signal),
  );
  expect(result).toMatchObject({
    complete: false,
    reason: "failed",
    error: "详情不可用",
  });
  expect(result.entries).toHaveLength(3);
  expect(result.entries.map((entry) => entry.detail)).toEqual([
    { orderSn: "261017-a", marker: "kept" },
    null,
    null,
  ]);
  expect(api.getOrderDetail).toHaveBeenCalledTimes(2);
  expect(api.getOrders).toHaveBeenCalledTimes(1);
});

test("an unrecognizable date stops filtering and keeps preceding orders", async () => {
  const kept = order();
  const api = source([[kept, order("not-a-date"), order("261016-unvisited")]]);
  const { result } = await drain(
    collectOrders(
      api,
      { ...options, startDate: "2026-10-01" },
      new AbortController().signal,
    ),
  );
  expect(result).toMatchObject({
    reason: "failed",
    complete: false,
    error: "无法识别订单日期，已停止收集。",
    progress: { pages: 1, scanned: 2, selected: 1 },
  });
  expect(result.entries).toEqual([{ order: kept, detail: null }]);
  expect(api.getOrders).toHaveBeenCalledOnce();
  expect(api.getOrderDetail).not.toHaveBeenCalled();
});

test("unfiltered collection does not require recognizable dates", async () => {
  const page = [order("not-a-date")];
  const { result } = await drain(
    collectOrders(source([page]), options, new AbortController().signal),
  );
  expect(result).toMatchObject({ reason: "end", complete: true });
  expect(result.entries.map((entry) => entry.order)).toEqual(page);
});

test("a page cap cannot claim completeness and invalid date options are rejected", async () => {
  const limited = await drain(
    collectOrders(
      source([[order()]]),
      { ...options, maxPages: 1 },
      new AbortController().signal,
    ),
  );
  expect(limited.result).toMatchObject({ reason: "limit", complete: false });
  expect(() =>
    validateOptions({ ...options, startDate: "2026-02-30" }),
  ).toThrow();
});
