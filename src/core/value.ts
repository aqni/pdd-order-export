import type { JsonObject } from './types';

export function isRecord(value: unknown): value is JsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !JSON.isRawJSON(value)
  );
}
