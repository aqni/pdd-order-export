import type {
  ExportOptions,
  ExportResult,
  JsonObject,
  Order,
} from '../src/core/types';

export const options: ExportOptions = {
  startDate: '',
  endDate: '',
  pageSize: 10,
  maxPages: 10,
  includeDetails: false,
};

export function order(id = '261017-synthetic', raw: JsonObject = {}): Order {
  return { id, raw: { order_sn: id, offset: id, ...raw } };
}

export function result(): ExportResult {
  return {
    schemaVersion: 1,
    startedAt: '2026-10-17T08:00:00.000Z',
    finishedAt: '2026-10-17T08:01:00.000Z',
    options: { ...options },
    reason: 'end',
    complete: true,
    message: 'synthetic',
    progress: {
      pages: 2,
      scanned: 1,
      selected: 1,
      duplicates: 0,
      unknownDates: 0,
      detailFailures: 0,
    },
    entries: [{ order: order().raw, detail: null, detailStatus: 'skipped' }],
  };
}
