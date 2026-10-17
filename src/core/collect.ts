import { checkCancelled, delay, errorMessage, ExportError } from './errors';
import { estimatedOrderDate, validateOptions } from './dates';
import type {
  ExportOptions,
  ExportEntry,
  ExportResult,
  LiveProgress,
  OrderSource,
  Progress,
  StopReason,
} from './types';

const stopMessages: Record<StopReason, string> = {
  end: '已读到空页，列表遍历结束。',
  limit: '已达到页数上限，结果不完整。',
  stalled: '分页游标缺失、重复或列表没有进展，结果不完整。',
  cancelled: '已取消，保留已获取的结果。',
  failed: '请求失败，保留已获取的结果。',
};

/** A task owns its results; progress callbacks receive snapshots, never mutable counters. */
export async function collectOrders(
  source: OrderSource,
  input: ExportOptions,
  signal: AbortSignal,
  onProgress: (value: LiveProgress) => void = () => {},
  intervalMs = 600,
): Promise<ExportResult> {
  const options = validateOptions(input);
  const progress: Progress = {
    pages: 0,
    scanned: 0,
    selected: 0,
    duplicates: 0,
    unknownDates: 0,
    detailFailures: 0,
  };
  const result: ExportResult = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    options,
    reason: 'limit',
    complete: false,
    message: '',
    progress,
    entries: [],
  };
  const seenOrderIds = new Set<string>();
  const seenCursorKeys = new Set<string>();
  let cursor: string | undefined;
  let requestCount = 0;
  let current: LiveProgress['current'] = { kind: 'list', page: 1 };
  const reportProgress = () =>
    onProgress({ ...progress, current: { ...current } });
  const beforeRequest = async () => {
    checkCancelled(signal);
    if (requestCount > 0) {
      await delay(intervalMs, signal);
    }
    requestCount++;
  };
  try {
    while (progress.pages < options.maxPages) {
      current = { kind: 'list', page: progress.pages + 1 };
      reportProgress();
      await beforeRequest();
      const page = await source.list(cursor, options.pageSize, signal);
      progress.pages++;
      if (page.orders.length === 0) {
        checkCancelled(signal);
        result.reason = 'end';
        break;
      }
      const pendingDetails: { id: string; entry: ExportEntry }[] = [];
      let newOrderCount = 0;
      // Commit the entire received page before the first cancellable detail request.
      for (const { id, raw } of page.orders) {
        if (seenOrderIds.has(id)) {
          progress.duplicates++;
          continue;
        }
        seenOrderIds.add(id);
        newOrderCount++;
        progress.scanned++;
        if (options.startDate || options.endDate) {
          const date = estimatedOrderDate(id);
          if (!date) {
            progress.unknownDates++;
            continue;
          }
          if (
            (options.startDate && date < options.startDate) ||
            (options.endDate && date > options.endDate)
          ) {
            continue;
          }
        }
        const entry: ExportEntry = {
          order: raw,
          detail: null,
          detailStatus: 'skipped',
        };
        result.entries.push(entry);
        pendingDetails.push({ id, entry });
        progress.selected++;
      }
      reportProgress();
      checkCancelled(signal);
      if (options.includeDetails && pendingDetails.length > 0) {
        current = {
          kind: 'details',
          page: progress.pages,
          completed: 0,
          total: pendingDetails.length,
        };
        reportProgress();
        for (const { id, entry } of pendingDetails) {
          try {
            await beforeRequest();
            entry.detail = await source.details(id, signal);
            entry.detailStatus = 'ok';
            current.completed++;
            checkCancelled(signal);
          } catch (error) {
            checkCancelled(signal);
            entry.detailStatus = 'failed';
            progress.detailFailures++;
            current.completed++;
            if (error instanceof ExportError && error.code === 'session') {
              throw error;
            }
          }
          reportProgress();
        }
      }
      checkCancelled(signal);
      if (!newOrderCount || page.nextCursor === undefined) {
        result.reason = 'stalled';
        break;
      }
      const key = page.nextCursor;
      if (seenCursorKeys.has(key)) {
        result.reason = 'stalled';
        break;
      }
      seenCursorKeys.add(key);
      cursor = page.nextCursor;
    }
  } catch (error) {
    result.reason = signal.aborted ? 'cancelled' : 'failed';
    if (!signal.aborted) {
      result.message = errorMessage(error);
    }
  }
  result.complete =
    result.reason === 'end' &&
    !progress.unknownDates &&
    !progress.detailFailures;
  if (result.message === '') {
    result.message = stopMessages[result.reason];
  }
  if (progress.unknownDates) {
    result.message += ` ${progress.unknownDates} 条订单日期无法识别，已排除。`;
  }
  if (progress.detailFailures) {
    result.message += ` ${progress.detailFailures} 条详情读取失败，保留列表数据。`;
  }
  result.finishedAt = new Date().toISOString();
  reportProgress();
  return result;
}
