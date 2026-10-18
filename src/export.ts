import type { ReadonlyExportResult } from "./collect";
import { createAssert, type tags } from "typia";
import { unparse } from "papaparse";

type NonNegativeInteger = number &
  tags.Minimum<0> &
  tags.TagBase<{
    target: "number";
    kind: "safeInteger";
    value: true;
    validate: "Number.isSafeInteger($input)";
  }>;

/** CSV fields and their observed types in the reviewed PDD sample. */
interface Order {
  order_sn: string;
  mall?: { mall_name?: string };
  order_status_prompt?: string;
  order_amount?: NonNegativeInteger;
  order_goods?: {
    goods_name?: string;
    spec?: string;
    goods_number?: NonNegativeInteger;
    goods_price?: NonNegativeInteger;
  }[];
}

interface OrderDetail {
  orderDescList?: { key: string; value: string }[];
}

const assertOrder = createAssert<Order>();
const assertOrderDetail = createAssert<OrderDetail | null>();

const formats = {
  csv: {
    encode: (result) => ["\ufeff", toCsv(result)],
    type: "text/csv;charset=utf-8",
  },
  json: {
    encode: (result) => [toJson(result)],
    type: "application/json;charset=utf-8",
  },
} satisfies Record<
  string,
  { encode: (result: ReadonlyExportResult) => BlobPart[]; type: string }
>;

export type FileFormat = keyof typeof formats;

export function exportFile(
  result: ReadonlyExportResult,
  format: FileFormat,
): { name: string; blob: Blob } {
  const range = `${result.options.startDate || "不限"}至${result.options.endDate || "不限"}`;
  const stamp = result.startedAt.replace(/[:.]/g, "-");
  const { encode, type } = formats[format];
  return {
    name: `拼多多账单_${range}_${stamp}${result.complete ? "" : "_不完整"}.${format}`,
    blob: new Blob(encode(result), { type }),
  };
}

export function downloadFile({
  name,
  blob,
}: {
  name: string;
  blob: Blob;
}): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  }
}

function toCsv(result: ReadonlyExportResult): string {
  return unparse(toTable(result));
}

function toJson(result: ReadonlyExportResult): string {
  return JSON.stringify(result, null, 2);
}

/** Table records preserve column order without changing the original data. */
function toTable(result: ReadonlyExportResult): Record<string, string>[] {
  return result.entries.map((entry) => {
    const order = assertOrder(entry.order);
    const detail = assertOrderDetail(entry.detail);
    const details = detailFields(detail?.orderDescList);
    return {
      订单编号: order.order_sn,
      店铺: order.mall?.mall_name ?? "",
      商品: goods(order.order_goods),
      订单状态: order.order_status_prompt ?? "",
      "订单金额（元）": amount(order.order_amount),
      支付方式: details.get("支付方式") ?? "",
      下单时间: details.get("下单时间") ?? "",
      物流公司: details.get("物流公司") ?? "",
      快递单号: details.get("快递单号") ?? "",
    };
  });
}

function amount(value: NonNegativeInteger | undefined): string {
  if (value === undefined) {
    return "";
  }
  return (value / 100).toFixed(2);
}

function goods(value: Order["order_goods"]): string {
  const clean = (text = "") => text.replace(/[,;，；\s]+/g, " ").trim();
  return (value ?? [])
    .map((item) => {
      const spec = clean(item.spec);
      const name = clean(item.goods_name);
      const quantity = item.goods_number;
      const price = amount(item.goods_price);
      return [
        name ? `商品：${name}` : "",
        spec ? `规格：${spec}` : "",
        quantity === undefined ? "" : `数量：${quantity}`,
        price === "" ? "" : `单价：${price}元`,
      ]
        .filter(Boolean)
        .join("，");
    })
    .filter(Boolean)
    .join("；");
}

function detailFields(
  value: OrderDetail["orderDescList"],
): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const { key, value: content } of value ?? []) {
    const name = key.trim().replace(/[：:]$/, "");
    if (!fields.has(name)) fields.set(name, content);
  }
  return fields;
}
