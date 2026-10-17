import { expect, it, vi } from 'vitest';
import { collectOrders } from '../src/core/collect';
import { validateOptions } from '../src/core/dates';
import { ExportError } from '../src/core/errors';
import type { LiveProgress, OrderSource, Page } from '../src/core/types';
import { options, order } from './fixtures';

function source(pages: Page[]): OrderSource {
  let index = 0;
  return {
    list: vi.fn(
      async () => pages[index++] ?? { orders: [], nextCursor: undefined },
    ),
    details: vi.fn(async () => ({ synthetic: true })),
  };
}
function run(api: OrderSource, extra = {}) {
  return collectOrders(
    api,
    { ...options, ...extra },
    new AbortController().signal,
    undefined,
    0,
  );
}

it('reports per-page detail work without inventing a total or changing exported progress', async () => {
  const api = source([
    { orders: [order('261017-a'), order('261017-b')], nextCursor: '1' },
    { orders: [order('261017-c')], nextCursor: '2' },
  ]);
  vi.mocked(api.details).mockRejectedValueOnce(new Error('synthetic failure'));
  const snapshots: LiveProgress[] = [];
  const value = await collectOrders(
    api,
    { ...options, includeDetails: true },
    new AbortController().signal,
    (snapshot) => snapshots.push(snapshot),
    0,
  );
  expect(snapshots[0]!.current).toEqual({ kind: 'list', page: 1 });
  const details = snapshots
    .filter((snapshot) => snapshot.current.kind === 'details')
    .map((snapshot) => snapshot.current);
  expect(details).toEqual([
    { kind: 'details', page: 1, completed: 0, total: 2 },
    { kind: 'details', page: 1, completed: 1, total: 2 },
    { kind: 'details', page: 1, completed: 2, total: 2 },
    { kind: 'details', page: 2, completed: 0, total: 1 },
    { kind: 'details', page: 2, completed: 1, total: 1 },
  ]);
  expect(value.progress.detailFailures).toBe(1);
  expect(value.progress).not.toHaveProperty('current');
  expect(value.entries).toHaveLength(3);
  expect(value.complete).toBe(false);
});

it('scans unsorted pages, applies inclusive date bounds and does not terminate early', async () => {
  const api = source([
    { orders: [order('260101-old'), order('261017-match')], nextCursor: '0' },
    {
      orders: [order('261018-new'), order('261016-match')],
      nextCursor: '{"value":1}',
    },
  ]);
  const value = await run(api, {
    startDate: '2026-10-16',
    endDate: '2026-10-17',
  });
  expect(value.entries.map((entry) => entry.order.order_sn)).toEqual([
    '261017-match',
    '261016-match',
  ]);
  expect(value.complete).toBe(true);
  expect(api.list).toHaveBeenNthCalledWith(2, '0', 10, expect.any(AbortSignal));
  expect(api.details).not.toHaveBeenCalled();
});

it('deduplicates orders and detects repeated opaque cursors', async () => {
  const api = source([
    { orders: [order('261017-a')], nextCursor: '{"a":1,"b":2}' },
    {
      orders: [order('261017-a'), order('261017-b')],
      nextCursor: '{"a":1,"b":2}',
    },
  ]);
  const value = await run(api);
  expect(value.reason).toBe('stalled');
  expect(value.entries).toHaveLength(2);
  expect(value.progress.duplicates).toBe(1);
  expect(value.complete).toBe(false);
});

it.each([undefined])(
  'retains a page with no usable cursor (%s) as partial',
  async (cursor) => {
    const value = await run(
      source([{ orders: [order()], nextCursor: cursor }]),
    );
    expect(value.entries).toHaveLength(1);
    expect(value.reason).toBe('stalled');
  },
);

it('does not treat a short nonempty page or the page limit as completion', async () => {
  const api = source([{ orders: [order()], nextCursor: '1' }]);
  const value = await run(api, { maxPages: 1 });
  expect(value.reason).toBe('limit');
  expect(value.complete).toBe(false);
  expect(value.entries).toHaveLength(1);
});

it('excludes unrecognizable dates only when a filter is active and flags partial results', async () => {
  const pages = [{ orders: [order('invalid-date')], nextCursor: '1' }];
  const filtered = await run(source(pages), { startDate: '2026-01-01' });
  expect(filtered.entries).toHaveLength(0);
  expect(filtered.progress.unknownDates).toBe(1);
  expect(filtered.complete).toBe(false);
  expect((await run(source(pages))).entries).toHaveLength(1);
});

it('keeps list data when details fail and stops on session failure', async () => {
  const api = source([
    { orders: [order('261017-a'), order('261017-b')], nextCursor: '1' },
  ]);
  vi.mocked(api.details)
    .mockRejectedValueOnce(new ExportError('详情不可用'))
    .mockRejectedValueOnce(
      new ExportError('synthetic session error', 'session'),
    );
  const value = await run(api, { includeDetails: true });
  expect(value.reason).toBe('failed');
  expect(value.progress.detailFailures).toBe(2);
  expect(value.entries.map((entry) => entry.detailStatus)).toEqual([
    'failed',
    'failed',
  ]);
});

it('retains received orders when cancelled during a detail request', async () => {
  const controller = new AbortController();
  const api = source([{ orders: [order()], nextCursor: '1' }]);
  vi.mocked(api.details).mockImplementation(async () => {
    controller.abort();
    throw new DOMException('', 'AbortError');
  });
  const value = await collectOrders(
    api,
    { ...options, includeDetails: true },
    controller.signal,
    undefined,
    0,
  );
  expect(value.reason).toBe('cancelled');
  expect(value.entries).toHaveLength(1);
  expect(value.progress.detailFailures).toBe(0);
  expect(value.complete).toBe(false);
});

it('retains earlier pages on protocol failure and does not expose unexpected errors', async () => {
  const api = source([{ orders: [order()], nextCursor: '1' }]);
  vi.mocked(api.list)
    .mockResolvedValueOnce({ orders: [order()], nextCursor: '1' })
    .mockRejectedValueOnce(new Error('sensitive synthetic request URL'));
  const value = await run(api);
  expect(value.reason).toBe('failed');
  expect(value.entries).toHaveLength(1);
  expect(value.message).not.toContain('sensitive');
  expect(value.complete).toBe(false);
});

it('cancellation before starting makes no requests', async () => {
  const api = source([]);
  const value = await collectOrders(
    api,
    options,
    AbortSignal.abort(),
    undefined,
    0,
  );
  expect(value.reason).toBe('cancelled');
  expect(api.list).not.toHaveBeenCalled();
});

it('retains a resolved list page even when cancellation wins the next microtask', async () => {
  const controller = new AbortController();
  const api = source([]);
  vi.mocked(api.list).mockImplementation(async () => {
    controller.abort();
    return { orders: [order('261017-a'), order('261017-b')], nextCursor: '1' };
  });
  const value = await collectOrders(
    api,
    { ...options, includeDetails: true },
    controller.signal,
    undefined,
    0,
  );
  expect(value.reason).toBe('cancelled');
  expect(value.complete).toBe(false);
  expect(value.entries.map((entry) => entry.order.order_sn)).toEqual([
    '261017-a',
    '261017-b',
  ]);
  expect(api.details).not.toHaveBeenCalled();
});

it('retains resolved detail data when cancellation arrives at the response boundary', async () => {
  const controller = new AbortController();
  const api = source([{ orders: [order()], nextCursor: '1' }]);
  vi.mocked(api.details).mockImplementation(async () => {
    controller.abort();
    return { synthetic: true };
  });
  const value = await collectOrders(
    api,
    { ...options, includeDetails: true },
    controller.signal,
    undefined,
    0,
  );
  expect(value.reason).toBe('cancelled');
  expect(value.entries[0]).toMatchObject({
    detail: { synthetic: true },
    detailStatus: 'ok',
  });
  expect(value.progress.detailFailures).toBe(0);
  expect(value.complete).toBe(false);
});

it('keeps the whole received page when cancellation interrupts its first detail', async () => {
  const controller = new AbortController();
  const api = source([
    {
      orders: [order('261017-a'), order('261017-b'), order('261017-c')],
      nextCursor: '1',
    },
  ]);
  vi.mocked(api.details).mockImplementation(async () => {
    controller.abort();
    throw new DOMException('', 'AbortError');
  });
  const value = await collectOrders(
    api,
    { ...options, includeDetails: true },
    controller.signal,
    undefined,
    0,
  );
  expect(value.reason).toBe('cancelled');
  expect(value.entries.map((entry) => entry.order.order_sn)).toEqual([
    '261017-a',
    '261017-b',
    '261017-c',
  ]);
  expect(value.progress.selected).toBe(3);
  expect(value.progress.detailFailures).toBe(0);
  expect(api.details).toHaveBeenCalledTimes(1);
});

it.each([
  { startDate: '2026-02-30' },
  { startDate: '2026-11-01', endDate: '2026-10-01' },
  { pageSize: 0 },
  { pageSize: 1.5 },
  { pageSize: 51 },
  { maxPages: NaN },
  { maxPages: 501 },
])('rejects invalid options %j', (extra) => {
  expect(() => validateOptions({ ...options, ...extra })).toThrow(ExportError);
});
