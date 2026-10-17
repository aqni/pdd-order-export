import { ExportError } from './errors';
import type { Json, JsonNumber } from './types';

// TypeScript's ES2022 library does not yet declare JSON source text access.
declare global {
  interface JSON {
    rawJSON(source: string): JsonNumber;
    isRawJSON(value: unknown): value is JsonNumber;
  }
}

/** Parse business data without replacing JSON numbers with quoted strings. */
export function parseJson(source: string): Json {
  if (
    typeof JSON.rawJSON !== 'function' ||
    typeof JSON.isRawJSON !== 'function'
  ) {
    throw new ExportError(
      '当前浏览器不支持无损 JSON 数值，请升级浏览器后重试。',
      'schema',
    );
  }
  return JSON.parse(
    source,
    (_key, value: unknown, context?: { source: string }) => {
      if (typeof value !== 'number') {
        return value;
      }
      if (!context?.source) {
        throw new ExportError(
          '当前浏览器不支持 JSON 数值源文本，请升级浏览器后重试。',
          'schema',
        );
      }
      if (
        /^-?\d+$/.test(context.source) &&
        Number.isSafeInteger(value) &&
        !Object.is(value, -0)
      ) {
        return value;
      }
      return JSON.rawJSON(context.source);
    },
  );
}
