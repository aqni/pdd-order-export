import { ExportError } from './errors';
import type { DatePreset, ExportOptions } from './types';
function calendarDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function presetDates(preset: DatePreset, today = new Date()) {
  if (preset === 'all') {
    return { startDate: '', endDate: '' };
  }
  const month = preset === 'previous' ? today.getMonth() - 1 : today.getMonth();
  const first = new Date(today.getFullYear(), month, 1);
  const last =
    preset === 'month' ? today : new Date(today.getFullYear(), month + 1, 0);
  return { startDate: calendarDate(first), endDate: calendarDate(last) };
}

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function estimatedOrderDate(id: string): string | null {
  const parts = /^(\d{2})(\d{2})(\d{2})-/.exec(id);
  if (!parts) {
    return null;
  }
  const date = `20${parts[1]}-${parts[2]}-${parts[3]}`;
  return isDate(date) ? date : null;
}

export function validateOptions(input: ExportOptions): ExportOptions {
  const { startDate, endDate, pageSize, maxPages } = input;
  if ([startDate, endDate].some((date) => date && !isDate(date))) {
    throw new ExportError('请输入有效的日期。', 'input');
  }
  if (startDate && endDate && startDate > endDate) {
    throw new ExportError('开始日期不能晚于结束日期。', 'input');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new ExportError('每页数量必须是 1–50 的整数。', 'input');
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 500) {
    throw new ExportError('页数上限必须是 1–500 的整数。', 'input');
  }
  return { ...input };
}
