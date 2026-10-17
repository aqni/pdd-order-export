import { expect, it, vi } from 'vitest';
import { createExportSession } from '../src/ui/session';
import type { TaskState } from '../src/ui/model';
import type { ExportResult, FileFormat, OrderSource } from '../src/core/types';
import { options, result } from './fixtures';

const source: OrderSource = {
  list: async () => ({ orders: [], nextCursor: undefined }),
  details: async () => ({}),
};

it.each<FileFormat>(['csv', 'json'])(
  'automatically downloads the selected %s format without DOM',
  async (format) => {
    const states: TaskState[] = [];
    const download = vi.fn();
    const session = createExportSession((state) => states.push(state), {
      source: () => source,
      collect: vi.fn().mockResolvedValue(result()),
      download,
    });
    session.submit(options, format);
    await vi.waitFor(() => expect(states.at(-1)?.running).toBe(false));
    expect(states.some((state) => state.running)).toBe(true);
    expect(states.at(-1)?.result?.entries).toHaveLength(1);
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]![0].name).toMatch(
      new RegExp(`\\.${format}$`),
    );
    session.dispose();
  },
);

it('does not automatically download an empty result', async () => {
  const empty = result();
  empty.entries = [];
  empty.progress.selected = 0;
  const states: TaskState[] = [];
  const download = vi.fn();
  const session = createExportSession((state) => states.push(state), {
    source: () => source,
    collect: vi.fn().mockResolvedValue(empty),
    download,
  });
  session.submit(options, 'csv');
  await vi.waitFor(() => expect(states.at(-1)?.running).toBe(false));
  expect(states.at(-1)?.status).toContain('没有找到订单');
  expect(download).not.toHaveBeenCalled();
  session.dispose();
});

it('retains partial results for explicit downloads in either format', async () => {
  const partial = result();
  partial.complete = false;
  partial.reason = 'stalled';
  partial.message = '分页游标重复';
  const states: TaskState[] = [];
  const download = vi.fn();
  const session = createExportSession((state) => states.push(state), {
    source: () => source,
    collect: vi.fn().mockResolvedValue(partial),
    download,
  });
  session.submit(options, 'csv');
  await vi.waitFor(() => expect(states.at(-1)?.running).toBe(false));
  expect(states.at(-1)?.result).toBe(partial);
  expect(download).not.toHaveBeenCalled();
  session.download('csv');
  session.download('json');
  expect(states.at(-1)?.status).toContain('结果不完整');
  expect(states.at(-1)?.status).toContain(partial.message);
  expect(download.mock.calls.map(([file]) => file.name)).toEqual([
    expect.stringMatching(/_不完整\.csv$/),
    expect.stringMatching(/_不完整\.json$/),
  ]);
  session.dispose();
});

it('clears an automatic download error when a manual retry succeeds', async () => {
  const states: TaskState[] = [];
  const download = vi.fn().mockImplementationOnce(() => {
    throw new Error('synthetic blocked download');
  });
  const session = createExportSession((state) => states.push(state), {
    source: () => source,
    collect: vi.fn().mockResolvedValue(result()),
    download,
  });
  session.submit(options, 'csv');
  await vi.waitFor(() => expect(states.at(-1)?.running).toBe(false));
  expect(states.at(-1)?.error).toContain('自动下载');
  session.download('json');
  expect(states.at(-1)?.error).toBe('');
  expect(states.at(-1)?.status).toContain('已发起 JSON 下载');
  expect(states.at(-1)?.status).toContain('浏览器下载列表');
  session.dispose();
});

it('a session failure prevents collection and downloads', () => {
  const states: TaskState[] = [];
  const collect = vi.fn();
  const download = vi.fn();
  const session = createExportSession((state) => states.push(state), {
    source: () => {
      throw new Error('synthetic session failure');
    },
    collect,
    download,
  });
  session.submit(options, 'csv');
  expect(states.at(-1)).toMatchObject({ running: false, result: null });
  expect(states.at(-1)?.error).toBeTruthy();
  expect(collect).not.toHaveBeenCalled();
  session.download('json');
  expect(download).not.toHaveBeenCalled();
  session.dispose();
});

it('a disposed session rejects further submit and download operations', () => {
  const getSource = vi.fn(() => source);
  const download = vi.fn();
  const session = createExportSession(() => {}, {
    source: getSource,
    collect: vi.fn(),
    download,
  });
  session.dispose();
  session.submit(options, 'csv');
  session.download('csv');
  expect(getSource).not.toHaveBeenCalled();
  expect(download).not.toHaveBeenCalled();
});

it('validates date ranges before creating a source', () => {
  const getSource = vi.fn(() => source);
  const states: TaskState[] = [];
  const session = createExportSession((state) => states.push(state), {
    source: getSource,
  });
  session.submit(
    { ...options, startDate: '2026-10-18', endDate: '2026-10-17' },
    'csv',
  );
  expect(getSource).not.toHaveBeenCalled();
  expect(states.at(-1)?.error).toContain('开始日期');
  session.dispose();
});

it('rejects concurrent tasks and downloads, then cancels through the active signal', async () => {
  let signal!: AbortSignal;
  const collect = vi.fn((_source, _options, activeSignal: AbortSignal) => {
    signal = activeSignal;
    return new Promise<ExportResult>((resolve) => {
      signal.addEventListener(
        'abort',
        () => {
          resolve({ ...result(), complete: false, reason: 'cancelled' });
        },
        { once: true },
      );
    });
  });
  const states: TaskState[] = [];
  const download = vi.fn();
  const session = createExportSession((state) => states.push(state), {
    source: () => source,
    collect,
    download,
  });
  session.submit(options, 'csv');
  session.submit(options, 'json');
  session.download('csv');
  expect(collect).toHaveBeenCalledTimes(1);
  expect(download).not.toHaveBeenCalled();
  session.cancel();
  expect(signal.aborted).toBe(true);
  expect(states.at(-1)?.status).toBe('正在取消…');
  await vi.waitFor(() => expect(states.at(-1)?.running).toBe(false));
  expect(states.at(-1)?.result?.reason).toBe('cancelled');
  expect(download).not.toHaveBeenCalled();
  session.download('json');
  expect(download).toHaveBeenCalledTimes(1);
  session.dispose();
});

it('disposing aborts work and ignores progress and completion delivered afterwards', async () => {
  let finish!: (value: ExportResult) => void;
  const collect = vi.fn<typeof import('../src/core/collect').collectOrders>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const render = vi.fn();
  const download = vi.fn();
  const session = createExportSession(render, {
    source: () => source,
    collect,
    download,
  });
  session.submit(options, 'csv');
  const signal = collect.mock.calls[0]![2];
  session.dispose();
  expect(signal.aborted).toBe(true);
  const renders = render.mock.calls.length;
  collect.mock.calls[0]![3]!({
    ...result().progress,
    current: { kind: 'list', page: 2 },
  });
  finish(result());
  await vi.waitFor(() => expect(collect).toHaveResolved());
  expect(render).toHaveBeenCalledTimes(renders);
  expect(download).not.toHaveBeenCalled();
});
