import { expect, it } from 'vitest';
import { presetDates } from '../src/core/dates';
import { cents, formatAmount, summarize } from '../src/core/money';
import { result } from './fixtures';
import type { ExportEntry, JsonObject } from '../src/core/types';

it('handles month shortcuts across year and leap-day boundaries using local calendar dates', () => {
  expect(presetDates('previous', new Date(2026, 0, 2))).toEqual({
    startDate: '2025-12-01',
    endDate: '2025-12-31',
  });
  expect(presetDates('previous', new Date(2024, 2, 1))).toEqual({
    startDate: '2024-02-01',
    endDate: '2024-02-29',
  });
  expect(presetDates('month', new Date(2026, 9, 17))).toEqual({
    startDate: '2026-10-01',
    endDate: '2026-10-17',
  });
  expect(presetDates('all')).toEqual({ startDate: '', endDate: '' });
});

it('sums integer cents exactly and distinguishes missing amounts from zero', () => {
  const entries = [
    0,
    10,
    '20',
    undefined,
    null,
    -1,
    'invalid',
  ].map<ExportEntry>((amount) => {
    const raw: JsonObject = {};
    if (amount !== undefined) raw.order_amount = amount;
    return { ...result().entries[0]!, order: raw };
  });
  expect(summarize(entries)).toEqual({
    orders: 7,
    amount: '0.30',
    missingAmounts: 4,
  });
});

it('marks an overflowing total unavailable instead of rounding or dropping orders', () => {
  const entries = [Number.MAX_SAFE_INTEGER, 1, 0, 'invalid'].map((amount) => ({
    ...result().entries[0]!,
    order: { order_amount: amount },
  }));
  expect(summarize(entries)).toEqual({
    orders: 4,
    amount: null,
    missingAmounts: 1,
  });
  expect(summarize(entries.slice(0, 1)).amount).toBe('90071992547409.91');
});

it.each([
  [0, 0],
  [199, 199],
  ['1', 1],
  ['199.0', 199],
  ['1.99e2', 199],
  [JSON.rawJSON('199.0'), 199],
  ['9007199254740991', Number.MAX_SAFE_INTEGER],
  ['9007199254740992', null],
  [Number.MAX_SAFE_INTEGER + 1, null],
  ['9.007199254740993e15', null],
  ['1.00000000000000000001', null],
  ['1e1000000', null],
  ['0e1000000', 0],
  ['-0.0', 0],
  ['-1e2', null],
  ['1e-400', null],
  [undefined, null],
  [null, null],
  [-1, null],
  [1.5, null],
  ['invalid', null],
])(
  'parses integer cents without inventing missing amounts (%s)',
  (input, expected) => {
    expect(cents(input)).toBe(expected);
  },
);

it('formats validated integer cents independently of input normalization', () => {
  expect(formatAmount(0)).toBe('0.00');
  expect(formatAmount(199)).toBe('1.99');
  expect(formatAmount(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
});
