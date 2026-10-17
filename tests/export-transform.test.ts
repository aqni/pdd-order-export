import { expect, it } from 'vitest';
import { normalizeEntry, type NormalizedEntry } from '../src/export/normalize';
import { formatCsvRow } from '../src/export/format';
import { result } from './fixtures';

it('normalization keeps structured values and exact cents without display or CSV decoration', () => {
  const entry = result().entries[0]!;
  entry.order.mall = { mall_name: '=合成店铺' };
  entry.order.order_amount = '398';
  entry.order.order_goods = [
    null,
    { goods_name: '商品', spec: '规格', goods_number: 0, goods_price: 199 },
  ];
  entry.detail = {
    orderDescList: [
      { key: ' 支付方式： ', value: '首项' },
      { key: '支付方式', value: '后项' },
    ],
  };
  const before = structuredClone(entry);
  const normalized = normalizeEntry(entry);
  expect(normalized.orderId).toBe('261017-synthetic');
  expect(normalized.shop).toBe('=合成店铺');
  expect(normalized.amountCents).toBe(398);
  expect(normalized.goods).toEqual([
    { name: '商品', specification: '规格', quantity: '0', priceCents: 199 },
  ]);
  expect(normalized.paymentMethod).toBe('首项');
  expect(entry).toEqual(before);
});

it('normalization distinguishes a missing or invalid amount from zero', () => {
  const entry = result().entries[0]!;
  entry.order.order_amount = 0;
  expect(normalizeEntry(entry).amountCents).toBe(0);
  entry.order.order_amount = 'invalid';
  expect(normalizeEntry(entry).amountCents).toBeNull();
  entry.order.order_amount = '9007199254740993';
  expect(formatCsvRow(normalizeEntry(entry), true)[5]).toBe('');
  delete entry.order.order_amount;
  expect(normalizeEntry(entry).amountCents).toBeNull();
});

it('formatting accepts a normalized entry without reading raw API data', () => {
  const entry: NormalizedEntry = {
    orderId: '261017-synthetic',
    estimatedDate: '2026-10-17',
    shop: '=合成店铺',
    goods: [
      { name: '商品', specification: '规格', quantity: '0', priceCents: 0 },
    ],
    orderStatus: '已完成',
    amountCents: 399,
    paymentMethod: '合成支付',
    placedAt: '',
    carrier: '',
    trackingNumber: '00123',
    detailStatus: 'ok',
  };
  expect(formatCsvRow(entry, false)).toEqual([
    "'261017-synthetic",
    '2026-10-17',
    '=合成店铺',
    '商品 / 规格 ×0 ￥0.00',
    '已完成',
    '3.99',
    '合成支付',
    '',
    '',
    "'00123",
    '已获取',
    '不完整',
  ]);
});
