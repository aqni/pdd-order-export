import type { ReadonlyExportResult } from "./collect";
import type { Order, OrderDetail } from "./pdd";
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

/** 在协议字段基础上补充 CSV 字段；金额单位为分，约束只影响 CSV 导出。 */
interface ExportedOrder extends Order {
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

interface ExportedOrderDetail extends OrderDetail {
  orderDescList?: { key: string; value: string }[];
}

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

/**
 * 从收集结果生成文件，不修改原始数据。
 * @throws CSV 字段不符合模型时抛出 Typia 详细错误；JSON 不做 CSV 校验。
 */
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
    // 给浏览器读取 Blob 的时间，避免点击后立即回收导致下载失败。
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  }
}

function toCsv(result: ReadonlyExportResult): string {
  return unparse(toTable(result), { escapeFormulae: true });
}

function toJson(result: ReadonlyExportResult): string {
  return JSON.stringify(result, null, 2);
}

// 模块级生成一次校验函数，保留字段路径等诊断供数据问题定位。
const assertExportedOrder = createAssert<ExportedOrder>();
const assertExportedOrderDetail = createAssert<ExportedOrderDetail | null>();

/** 属性插入顺序决定 CSV 列顺序；所有格式化均作用于新建的表格记录。 */
function toTable(result: ReadonlyExportResult): Record<string, string>[] {
  return result.entries.map((entry) => {
    const order = assertExportedOrder(entry.order);
    const detail = assertExportedOrderDetail(entry.detail);
    const details = detailFields(detail?.orderDescList);
    return {
      订单编号: order.order_sn,
      订单金额: amount(order.order_amount),
      店铺: order.mall?.mall_name ?? "",
      商品: goods(order.order_goods),
      订单状态: order.order_status_prompt ?? "",
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
  // 安全整数转十进制字符串，再拆分元、分，避免浮点除法丢失一分钱。
  const cents = String(value).padStart(3, "0");
  return `${cents.slice(0, -2)}.${cents.slice(-2)}`;
}

function goods(value: ExportedOrder["order_goods"]): string {
  // 商品名和规格中的分隔符换成空格，避免与摘要的字段、商品边界混淆。
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
  value: ExportedOrderDetail["orderDescList"],
): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const { key, value: content } of value ?? []) {
    const name = key.trim().replace(/[：:]$/, "");
    if (!fields.has(name)) fields.set(name, content);
  }
  return fields;
}
