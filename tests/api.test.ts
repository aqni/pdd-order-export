// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createOrderSource, readUserId } from '../src/api/client';
import { parseDetails, parseList } from '../src/api/client';
import type { Json } from '../src/core/types';
import observed from './fixtures/pdd/2026-10-17.sample.json' with { type: 'json' };

it('preserves the observed string cursor and unknown list fields across pages', async () => {
  const first = observed.pages[0]!;
  const second = observed.pages[1]!;
  const request = vi
    .fn()
    .mockResolvedValueOnce(JSON.stringify(first.response))
    .mockResolvedValueOnce(JSON.stringify(second.response));
  const api = createOrderSource('123', request);
  const signal = new AbortController().signal;
  const page = await api.list(undefined, 50, signal);
  expect(page.orders.map((order) => order.raw)).toEqual(first.response.orders);
  expect(typeof page.nextCursor).toBe('string');
  expect(page.nextCursor).toBe(JSON.stringify(second.request.offset));
  const next = await api.list(page.nextCursor, 50, signal);
  expect(next.orders.map((order) => order.raw)).toEqual(second.response.orders);
  expect(request).toHaveBeenNthCalledWith(
    2,
    '/proxy/api/api/aristotle/order_list_v4?pdduid=123',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(second.request),
    }),
    signal,
  );
});

it.each(observed.details)(
  'parses the anonymized observed detail for $orderId',
  (entry) => {
    const html = `<script>window.rawData = ${JSON.stringify({ data: entry.data })};</script>`;
    const parsed = parseDetails(html);
    expect(parsed).toEqual(entry.data);
    expect(parsed.orderSn).toBe(entry.orderId);
    expect(parsed.orderDescList).toEqual(expect.any(Array));
  },
);

const malformedLists: Json[] = [
  null,
  {},
  { orders: null },
  { orders: [{}] },
  { orders: [{ order_sn: 123 }] },
];
it.each(malformedLists)('rejects malformed list responses %j', (value) => {
  expect(() => parseList(JSON.stringify(value))).toThrow();
});

it('accepts a real empty page and retains raw records and a zero cursor', () => {
  expect(parseList('{"orders":[]}')).toEqual({
    orders: [],
    nextCursor: undefined,
  });
  const raw = {
    order_sn: '261017-synthetic',
    offset: 0,
    unknown_field: { retained: true },
  };
  expect(parseList(JSON.stringify({ orders: [raw] }))).toEqual({
    orders: [{ id: raw.order_sn, raw }],
    nextCursor: '0',
  });
});

it('extracts nested JSON and escaped braces without executing scripts', () => {
  const data = {
    data: { text: '} ; \\" { nested', nested: { enabled: true } },
  };
  expect(
    parseDetails(
      `<script>window.syntheticExecuted=true;window.rawData=${JSON.stringify(data)};window.after=1;</script>`,
    ),
  ).toEqual(data.data);
  expect('syntheticExecuted' in window).toBe(false);
});

it.each([
  '<html>login</html>',
  '<script>window.rawData={data:evil()};</script>',
  '<script>window.rawData={"data":null}</script>',
])('rejects missing or executable payloads', (html) => {
  expect(() => parseDetails(html)).toThrow();
});

it.each([
  ['pdd_user_id=123', '123'],
  ['other=456; pdd_user_id=123; extra=value', '123'],
  ['pdd_user_id=12%33', '123'],
  ['pdd_user_id=12345678901234567890', '12345678901234567890'],
  ['pdd_user_id=123; pdd_user_id=123', '123'],
])(
  'reads a UID cookie without numeric precision loss (%s)',
  (cookie, expected) => {
    expect(readUserId(cookie)).toBe(expected);
  },
);

it.each([
  '',
  'not_pdd_user_id=123',
  'pdd_user_id=',
  'pdd_user_id=0',
  'pdd_user_id=invalid',
  'pdd_user_id=%ZZ',
  'pdd_user_id=-123',
  'pdd_user_id=1.5',
  'pdd_user_id=123; pdd_user_id=456',
  'pdd_user_id=123; pdd_user_id=%ZZ',
])('rejects missing, malformed or ambiguous UID cookies (%s)', (cookie) => {
  expect(() => readUserId(cookie)).toThrow('Cookie');
});

it('reads the current document cookie by default without page application state', () => {
  document.cookie = 'pdd_user_id=789; path=/';
  try {
    expect(readUserId()).toBe('789');
  } finally {
    document.cookie = 'pdd_user_id=; max-age=0; path=/';
  }
});

it('encodes session and order IDs and preserves a zero cursor in same-origin requests', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce('{"orders":[]}')
    .mockResolvedValueOnce(
      '<script>window.rawData={"data":{"orderSn":"synthetic&order","orderDescList":[],"synthetic":true}};</script>',
    );
  const api = createOrderSource('synthetic&user', request);
  const signal = new AbortController().signal;
  await api.list('0', 10, signal);
  expect(request).toHaveBeenNthCalledWith(
    1,
    '/proxy/api/api/aristotle/order_list_v4?pdduid=synthetic%26user',
    expect.objectContaining({ body: '{"size":10,"offset":0}' }),
    signal,
  );
  expect(await api.details('synthetic&order', signal)).toEqual({
    orderSn: 'synthetic&order',
    orderDescList: [],
    synthetic: true,
  });
  expect(request).toHaveBeenNthCalledWith(
    2,
    '/order.html?order_sn=synthetic%26order',
    { method: 'GET' },
    signal,
  );
});

it.each([
  {},
  { orderSn: '261017-other', orderDescList: [] },
  { orderSn: '261017-requested' },
  { orderSn: '261017-requested', orderDescList: null },
  { orderSn: 261017, orderDescList: [] },
])('rejects unverified order details %j', async (data) => {
  const request = vi
    .fn()
    .mockResolvedValue(
      `<script>window.rawData=${JSON.stringify({ data })};</script>`,
    );
  const source = createOrderSource('123', request);
  await expect(
    source.details('261017-requested', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'schema' });
  expect(request).toHaveBeenCalledTimes(1);
});

it('protects numeric business fields in both list and detail responses', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      '{"orders":[{"order_sn":"261017-synthetic","offset":0,"order_amount":9007199254740993,"unknown_decimal":0.10000000000000000001}]}',
    )
    .mockResolvedValueOnce(
      '<script>window.rawData={"data":{"orderSn":"261017-synthetic","orderDescList":[{"key":"快递单号","value":9007199254740993}]}};</script>',
    );
  const source = createOrderSource('123', request);
  const signal = new AbortController().signal;
  const page = await source.list(undefined, 10, signal);
  expect(page.nextCursor).toBe('0');
  expect(page.orders[0]!.raw).toMatchObject({
    order_amount: JSON.rawJSON('9007199254740993'),
    unknown_decimal: JSON.rawJSON('0.10000000000000000001'),
  });
  const detail = await source.details('261017-synthetic', signal);
  expect(detail.orderDescList).toEqual([
    { key: '快递单号', value: JSON.rawJSON('9007199254740993') },
  ]);
});

it.each([
  ['0', '0'],
  ['"0"', '"0"'],
  ['false', 'false'],
  ['""', '""'],
  ['9007199254740993', '9007199254740993'],
  ['"9007199254740993"', '"9007199254740993"'],
  ['0.10000000000000000001', '0.10000000000000000001'],
  ['1.0', '1.0'],
  ['1e400', '1e400'],
  [
    '[9007199254740993,"9007199254740993"]',
    '[9007199254740993,"9007199254740993"]',
  ],
  [
    '{"z":9007199254740993,"a":[0.10000000000000000001,"9007199254740993"]}',
    '{"a":[0.10000000000000000001,"9007199254740993"],"z":9007199254740993}',
  ],
  ['"1,\\\"extra\\\":true"', '"1,\\\"extra\\\":true"'],
])(
  'round-trips the opaque cursor %s without changing its JSON type or digits',
  async (offset, encoded) => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        `{"orders":[{"order_sn":"261017-synthetic","offset":${offset}}]}`,
      )
      .mockResolvedValueOnce('{"orders":[]}');
    const source = createOrderSource('123', request);
    const signal = new AbortController().signal;
    const page = await source.list(undefined, 10, signal);
    expect(page.nextCursor).toBe(encoded);
    await source.list(page.nextCursor, 10, signal);
    expect(request.mock.calls[1]![1].body).toBe(
      `{"size":10,"offset":${encoded}}`,
    );
  },
);

it('canonicalizes object cursor keys and distinguishes numeric cursors from strings', () => {
  const first = parseList(
    '{"orders":[{"order_sn":"a","offset":{"a":1.25,"b":9007199254740993}}]}',
  );
  const reordered = parseList(
    '{"orders":[{"order_sn":"b","offset":{"b":9007199254740993,"a":1.25}}]}',
  );
  const string = parseList(
    '{"orders":[{"order_sn":"c","offset":{"a":"1.25","b":"9007199254740993"}}]}',
  );
  expect(first.nextCursor).toBe(reordered.nextCursor);
  expect(first.nextCursor).not.toBe(string.nextCursor);
});

it.each(['{}', '{"offset":null}'])(
  'treats a missing or null cursor as unusable while retaining the order (%s)',
  (fields) => {
    const order = { order_sn: '261017-synthetic', ...JSON.parse(fields) };
    const page = parseList(JSON.stringify({ orders: [order] }));
    expect(page.orders).toHaveLength(1);
    expect(page.nextCursor).toBeUndefined();
  },
);
