import { formatAmount } from '../core/money';
import type { NormalizedEntry, NormalizedGoods } from './normalize';

function formatOptionalAmount(value: number | null): string {
  return value === null ? '' : formatAmount(value);
}

function formatGoods(goods: readonly NormalizedGoods[]): string {
  return goods
    .map((item) => {
      const name = [item.name, item.specification].filter(Boolean).join(' / ');
      const parts = [name];
      if (item.quantity !== '') {
        parts.push(`×${item.quantity}`);
      }
      if (item.priceCents !== null) {
        parts.push(`￥${formatAmount(item.priceCents)}`);
      }
      return parts.filter(Boolean).join(' ');
    })
    .join('；');
}

interface CsvRowContext {
  entry: NormalizedEntry;
  complete: boolean;
}

interface CsvColumn {
  title: string;
  value: (row: CsvRowContext) => string;
  identifier?: boolean;
}

/** The ordered schema keeps display names, formatting and identifier policy together. */
const columns: readonly CsvColumn[] = [
  { title: '订单编号', value: ({ entry }) => entry.orderId, identifier: true },
  { title: '估算日期（订单号）', value: ({ entry }) => entry.estimatedDate },
  { title: '店铺', value: ({ entry }) => entry.shop },
  { title: '商品', value: ({ entry }) => formatGoods(entry.goods) },
  { title: '订单状态', value: ({ entry }) => entry.orderStatus },
  {
    title: '订单金额（元）',
    value: ({ entry }) => formatOptionalAmount(entry.amountCents),
  },
  { title: '支付方式', value: ({ entry }) => entry.paymentMethod },
  { title: '下单时间', value: ({ entry }) => entry.placedAt },
  { title: '物流公司', value: ({ entry }) => entry.carrier },
  {
    title: '快递单号',
    value: ({ entry }) => entry.trackingNumber,
    identifier: true,
  },
  {
    title: '详情状态',
    value: ({ entry }) =>
      ({ ok: '已获取', failed: '获取失败', skipped: '未获取' })[
        entry.detailStatus
      ],
  },
  {
    title: '结果完整性',
    value: ({ complete }) => (complete ? '列表遍历结束' : '不完整'),
  },
];

export const csvHeaders: readonly string[] = columns.map(
  (column) => column.title,
);

export function formatCsvRow(
  entry: NormalizedEntry,
  complete: boolean,
): string[] {
  return columns.map((column) => {
    const value = column.value({ entry, complete });
    if (
      value !== '' &&
      (column.identifier || /^\d{15,}$/.test(value.replace('.', '')))
    ) {
      return `'${value}`;
    }
    return value;
  });
}
