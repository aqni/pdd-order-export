import type { ReadonlyExportResult, FileFormat } from '../core/types';
import { normalizeEntry } from './normalize';
import { csvHeaders, formatCsvRow } from './format';
import { writeCsv } from './csv';

function* csvRows(result: ReadonlyExportResult): Generator<readonly string[]> {
  yield csvHeaders;
  for (const entry of result.entries) {
    const normalized = normalizeEntry(entry);
    yield formatCsvRow(normalized, result.complete);
  }
}

export function toCsv(result: ReadonlyExportResult): string {
  return writeCsv(csvRows(result));
}

export function toJson(result: ReadonlyExportResult): string {
  return JSON.stringify(result, null, 2);
}

export function exportFile(
  result: ReadonlyExportResult,
  format: FileFormat,
): { name: string; blob: Blob } {
  const range = `${result.options.startDate || '不限'}至${result.options.endDate || '不限'}`;
  const stamp = result.startedAt.replace(/[:.]/g, '-');
  return {
    name: `拼多多账单_${range}_${stamp}${result.complete ? '' : '_不完整'}.${format}`,
    blob: new Blob([format === 'csv' ? toCsv(result) : toJson(result)], {
      type:
        format === 'csv'
          ? 'text/csv;charset=utf-8'
          : 'application/json;charset=utf-8',
    }),
  };
}
