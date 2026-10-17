// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createOrderSource } from '../../src/api/client';
import { createHttpClient } from '../../src/api/http';
import { collectOrders } from '../../src/core/collect';
import { summarize } from '../../src/core/money';
import { parseJson } from '../../src/core/json';
import { toCsv, toJson } from '../../src/export/serialize';
import { options } from '../fixtures';
import sample from '../fixtures/pdd/2026-10-17.sample.json' with { type: 'json' };

it('keeps cursor wire types separate from exact business numbers through collection and export', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      new Response(
        '{"orders":[{"order_sn":"261017-first","offset":9007199254740993,"order_amount":9007199254740993,"unknown_decimal":0.10000000000000000001,"order_goods":[{"goods_name":"synthetic","goods_number":2,"goods_price":1.99e2}]}]}',
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        '<script>window.rawData={"data":{"orderSn":"261017-first","orderDescList":[{"key":"快递单号","value":9007199254740993}]}};</script>',
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        '{"orders":[{"order_sn":"261017-second","offset":"9007199254740993","order_amount":199.0}]}',
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        '<script>window.rawData={"data":{"orderSn":"261017-second","orderDescList":[]}};</script>',
      ),
    )
    .mockResolvedValueOnce(new Response('{"orders":[]}'));
  const result = await collectOrders(
    createOrderSource('123', createHttpClient({ fetch })),
    { ...options, includeDetails: true },
    new AbortController().signal,
    undefined,
    0,
  );
  expect(result.complete).toBe(true);
  expect(result.progress.pages).toBe(3);
  expect(fetch).toHaveBeenCalledTimes(5);
  expect(fetch.mock.calls[2]![1]!.body).toBe(
    '{"size":10,"offset":9007199254740993}',
  );
  expect(fetch.mock.calls[4]![1]!.body).toBe(
    '{"size":10,"offset":"9007199254740993"}',
  );
  expect(summarize(result.entries)).toEqual({
    orders: 2,
    amount: '1.99',
    missingAmounts: 1,
  });
  const json = toJson(result);
  expect(json).toContain('"order_amount": 9007199254740993');
  expect(json).toContain('"unknown_decimal": 0.10000000000000000001');
  expect(json).not.toContain('"rawJSON"');
  expect((parseJson(json) as { entries: unknown }).entries).toMatchObject([
    {
      order: {
        order_amount: JSON.rawJSON('9007199254740993'),
        unknown_decimal: JSON.rawJSON('0.10000000000000000001'),
      },
      detail: { orderDescList: [{ value: JSON.rawJSON('9007199254740993') }] },
      detailStatus: 'ok',
    },
    { order: { order_amount: JSON.rawJSON('199.0') }, detailStatus: 'ok' },
  ]);
  const csv = toCsv(result);
  expect(csv).not.toContain('90071992547409.93');
  expect(csv).toContain('"\'9007199254740993"');
  expect(csv).toContain('"1.99"');
  expect(csv).toContain('￥1.99');
  expect(toJson(result)).toBe(json);
});

it('replays anonymized pages through HTTP, parsing, collection and serialization', async () => {
  const uid = '900719925474099312345';
  const orders = sample.pages.flatMap((page) => page.response.orders);
  let pageIndex = 0;
  let detailIndex = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input), 'https://synthetic.invalid');
    expect(init?.credentials).toBe('include');
    expect(init?.redirect).toBe('error');
    if (url.pathname === '/proxy/api/api/aristotle/order_list_v4') {
      expect(init?.method).toBe('POST');
      expect([...url.searchParams]).toEqual([['pdduid', uid]]);
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
      const page = sample.pages[pageIndex];
      expect(JSON.parse(String(init?.body))).toEqual(
        page?.request ?? { size: 50, offset: orders.at(-1)!.offset },
      );
      expect(pageIndex).toBeLessThan(3);
      pageIndex++;
      return Response.json(page?.response ?? { orders: [] });
    }
    expect(url.pathname).toBe('/order.html');
    expect(init?.method).toBe('GET');
    const detail = sample.details[detailIndex];
    expect(detail).toBeDefined();
    expect([...url.searchParams]).toEqual([['order_sn', detail!.orderId]]);
    detailIndex++;
    return new Response(
      `<script>window.rawData = ${JSON.stringify({ data: detail!.data })};</script>`,
      { headers: { 'Content-Type': 'text/html' } },
    );
  });
  const source = createOrderSource(uid, createHttpClient({ fetch }));
  const result = await collectOrders(
    source,
    { ...options, pageSize: 50, includeDetails: true },
    new AbortController().signal,
    undefined,
    0,
  );

  expect(result).toMatchObject({
    complete: true,
    reason: 'end',
    progress: { pages: 3, scanned: 3, selected: 3, detailFailures: 0 },
  });
  expect(pageIndex).toBe(3);
  expect(detailIndex).toBe(3);
  expect(fetch).toHaveBeenCalledTimes(6);
  expect(JSON.parse(toJson(result)).entries).toEqual(
    orders.map((order) => ({
      order,
      detail: sample.details.find(
        (detail) => detail.orderId === order.order_sn,
      )!.data,
      detailStatus: 'ok',
    })),
  );
  const csv = toCsv(result);
  expect(csv.split('\r\n')).toHaveLength(5);
  for (const order of orders) {
    expect(csv).toContain(order.order_sn);
  }
});
