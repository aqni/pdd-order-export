import { ExportError } from '../core/errors';
import { isRecord } from '../core/value';
import type { Json, JsonObject, OrderSource, Page } from '../core/types';
import { createHttpClient } from './http';
import { parseJson } from '../core/json';

export function readUserId(cookies = document.cookie): string {
  const prefix = 'pdd_user_id=';
  const ids = new Set<string>();
  try {
    for (const part of cookies.split(';')) {
      const cookie = part.trim();
      if (cookie.startsWith(prefix)) {
        const value = decodeURIComponent(cookie.slice(prefix.length));
        ids.add(value);
      }
    }
    const [id] = ids;
    if (ids.size === 1 && id && /^[1-9]\d*$/.test(id)) {
      return id;
    }
  } catch {
    /* A malformed identity is a session failure. */
  }
  throw new ExportError(
    '无法从当前页面 Cookie 读取用户标识，请在当前页面重新登录后重试。',
    'session',
  );
}

/** Stable object key ordering detects cursor cycles without changing numeric literals. */
function encodeCursor(value: Json): string {
  if (Array.isArray(value)) {
    return '[' + value.map(encodeCursor).join(',') + ']';
  }
  if (isRecord(value)) {
    const fields = Object.keys(value)
      .sort()
      .map((key) => {
        return JSON.stringify(key) + ':' + encodeCursor(value[key]!);
      });
    return '{' + fields.join(',') + '}';
  }
  return JSON.stringify(value);
}

export function parseList(response: string): Page {
  let value: Json;
  try {
    value = parseJson(response);
  } catch (error) {
    if (error instanceof ExportError) {
      throw error;
    }
    throw new ExportError(
      '列表返回的不是 JSON，请检查登录状态或站点验证提示。',
      'schema',
    );
  }
  if (!isRecord(value) || !Array.isArray(value.orders)) {
    throw new ExportError(
      '订单列表格式不符合预期，无法判断是否已读完。',
      'schema',
    );
  }
  const orders = value.orders.map((raw) => {
    if (
      !isRecord(raw) ||
      typeof raw.order_sn !== 'string' ||
      raw.order_sn.trim() === ''
    ) {
      throw new ExportError('列表包含无效的订单编号，已停止读取。', 'schema');
    }
    return { id: raw.order_sn, raw };
  });
  const offset = orders.at(-1)?.raw.offset;
  return {
    orders,
    nextCursor:
      offset === undefined || offset === null
        ? undefined
        : encodeCursor(offset),
  };
}

/** Locate a JSON boundary without evaluating the surrounding page JavaScript. */
function payload(source: string, start: number): JsonObject | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let position = start; position < source.length; position++) {
    const char = source[position];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        const parsed = parseJson(source.slice(start, position + 1));
        if (isRecord(parsed) && isRecord(parsed.data)) {
          return parsed.data;
        }
        return null;
      }
    }
  }
  return null;
}

export function parseDetails(html: string): JsonObject {
  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const script of document.scripts) {
    const source = script.textContent ?? '';
    for (const match of source.matchAll(/\bwindow\.rawData\s*=\s*(?=\{)/g)) {
      try {
        const data = payload(source, match.index + match[0].length);
        if (data) {
          return data;
        }
      } catch {
        /* Keep searching for a valid JSON assignment. */
      }
    }
  }
  throw new ExportError(
    '详情页缺少可解析的数据，可能需要重新登录或接口已变更。',
    'schema',
  );
}

export function createOrderSource(
  uid: string,
  request = createHttpClient(),
): OrderSource {
  return {
    async list(cursor, size, signal) {
      let body = JSON.stringify({ size });
      if (cursor !== undefined) {
        body = `{"size":${JSON.stringify(size)},"offset":${cursor}}`;
      }
      const response = await request(
        `/proxy/api/api/aristotle/order_list_v4?${new URLSearchParams({ pdduid: uid })}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        },
        signal,
      );
      return parseList(response);
    },
    async details(id, signal) {
      const response = await request(
        `/order.html?${new URLSearchParams({ order_sn: id })}`,
        { method: 'GET' },
        signal,
      );
      const detail = parseDetails(response);
      if (detail.orderSn !== id || !Array.isArray(detail.orderDescList)) {
        throw new ExportError(
          '详情内容不符合当前订单，已保留列表数据。',
          'schema',
        );
      }
      return detail;
    },
  };
}
