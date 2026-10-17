import { estimatedOrderDate } from '../core/dates';
import { cents } from '../core/money';
import type { ReadonlyExportEntry } from '../core/types';
import { isRecord } from '../core/value';

export interface NormalizedGoods {
  name: string;
  specification: string;
  quantity: string;
  priceCents: number | null;
}

export interface NormalizedEntry {
  orderId: string;
  estimatedDate: string;
  shop: string;
  goods: NormalizedGoods[];
  orderStatus: string;
  amountCents: number | null;
  paymentMethod: string;
  placedAt: string;
  carrier: string;
  trackingNumber: string;
  detailStatus: ReadonlyExportEntry['detailStatus'];
}

function toText(value: unknown): string {
  if (JSON.isRawJSON(value)) {
    return value.rawJSON;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return '';
}

function normalizeGoods(value: unknown): NormalizedGoods[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).map((item) => ({
    name: toText(item.goods_name),
    specification: toText(item.spec),
    quantity: toText(item.goods_number),
    priceCents: cents(item.goods_price),
  }));
}

function indexDetailFields(value: unknown): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  if (!Array.isArray(value)) {
    return fields;
  }
  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== 'string') {
      continue;
    }
    const key = item.key.trim().replace(/[：:]$/, '');
    if (!fields.has(key)) {
      fields.set(key, toText(item.value));
    }
  }
  return fields;
}

/** Normalize an export projection without changing or replacing the original JSON. */
export function normalizeEntry(entry: ReadonlyExportEntry): NormalizedEntry {
  const order = entry.order;
  const orderId = toText(order.order_sn);
  const details = indexDetailFields(entry.detail?.orderDescList);
  return {
    orderId,
    estimatedDate: estimatedOrderDate(orderId) ?? '',
    shop: isRecord(order.mall) ? toText(order.mall.mall_name) : '',
    goods: normalizeGoods(order.order_goods),
    orderStatus: toText(order.order_status_prompt),
    amountCents: cents(order.order_amount),
    paymentMethod: details.get('支付方式') ?? '',
    placedAt: details.get('下单时间') ?? '',
    carrier: details.get('物流公司') ?? '',
    trackingNumber: details.get('快递单号') ?? '',
    detailStatus: entry.detailStatus,
  };
}
