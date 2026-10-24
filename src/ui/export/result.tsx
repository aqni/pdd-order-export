import { h } from "preact";
import type { CollectResult } from "../collect";

export function ExportResult({
  result: { entries, partial, startDate, endDate },
}: {
  result: CollectResult;
}) {
  const status = partial
    ? "结果不完整，已保留收到的订单。"
    : entries.length
      ? "收集完成。"
      : "未找到订单，请调整日期范围。";
  const details = entries.filter((entry) => entry.detail !== null).length;
  return (
    <div data-ui="export-result">
      <h3>收集结果</h3>
      <p role="status">{status}</p>
      <p class="counts">{`已收集 ${entries.length} 笔订单 · 详情 ${details} 笔`}</p>
      <p>{`结果日期：${formatDate(startDate)} 至 ${formatDate(endDate)}`}</p>
    </div>
  );
}
function formatDate(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? "不限";
}
