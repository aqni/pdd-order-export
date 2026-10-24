import { createElement } from "preact";
import type { CollectResult } from "../collect/controls";
import { ExportActions } from "./actions";

/** 仅接收完成后的结果快照，展示数据并提供文件导出操作。 */
export function ExportControls({ result }: ExportControlsProps) {
  const { entries, partial, startDate, endDate } = result;
  const status = partial
    ? "结果不完整，已保留收到的订单。"
    : entries.length
      ? "收集完成。"
      : "未找到订单，请调整日期范围。";
  const details = entries.filter((entry) => entry.detail !== null).length;
  return (
    <section aria-label="收集结果">
      <h3>收集结果</h3>
      <p role="status">{status}</p>
      <p class="counts">
        {`已收集 ${entries.length} 笔订单 · 详情 ${details} 笔`}
      </p>
      <p>{`结果日期：${formatDate(startDate)} 至 ${formatDate(endDate)}`}</p>
      <ExportActions result={result} />
    </section>
  );
}

interface ExportControlsProps {
  result: CollectResult;
}

function formatDate(date: Date | null): string {
  return date?.toISOString().slice(0, 10) ?? "不限";
}
