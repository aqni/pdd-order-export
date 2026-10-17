import type { ReadonlyExportEntry } from './types';

export function cents(value: unknown): number | null {
  if (JSON.isRawJSON(value)) {
    value = value.rawJSON;
  }
  if (typeof value === 'string') {
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
    if (!match) {
      return null;
    }
    const fraction = match[3] ?? '';
    let digits = (match[2]! + fraction).replace(/^0+/, '');
    if (digits === '') {
      return 0;
    }
    if (match[1] === '-') {
      return null;
    }
    const shift = Number(match[4] ?? 0) - fraction.length;
    // Remove only zero fractional digits before converting to number, so rounding
    // cannot turn a fractional cent into an accepted integer.
    if (shift >= 0) {
      // Safe integers have at most 16 decimal digits.
      if (digits.length + shift > 16) {
        return null;
      }
      digits = digits.padEnd(digits.length + shift, '0');
    } else {
      const end = digits.length + shift;
      if (end <= 0 || !/^0*$/.test(digits.slice(end))) {
        return null;
      }
      digits = digits.slice(0, end);
    }
    value = Number(digits);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  return null;
}

export function formatAmount(value: number): string {
  const digits = String(value).padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function summarize(entries: readonly ReadonlyExportEntry[]) {
  let totalCents: number | null = 0;
  let missingAmounts = 0;
  for (const { order } of entries) {
    const amount = cents(order.order_amount);
    if (amount === null) {
      missingAmounts++;
    } else if (totalCents !== null) {
      const next: number = totalCents + amount;
      totalCents = Number.isSafeInteger(next) ? next : null;
    }
  }
  return {
    orders: entries.length,
    amount: totalCents === null ? null : formatAmount(totalCents),
    missingAmounts,
  };
}
