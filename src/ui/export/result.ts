import { LitElement, html, css, nothing } from "lit";
import type { CollectResult } from "../collect";

/** 结果摘要，只根据收到的快照展示条数、完整性和日期范围。 */
class ExportResult extends LitElement {
  static properties = { result: { attribute: false } };
  static styles = css`
    :host {
      display: grid;
      gap: 0.5em;
    }
    h3 {
      margin: 0;
      font-size: 1em;
    }
    p {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .counts {
      font-variant-numeric: tabular-nums;
    }
  `;
  declare result: CollectResult | undefined;
  protected render() {
    const result = this.result;
    if (!result) return nothing;
    const { entries, partial, startDate, endDate } = result;
    const status = partial
      ? "结果不完整，已保留收到的订单。"
      : entries.length
        ? "收集完成。"
        : "未找到订单，请调整日期范围。";
    const details = entries.filter((entry) => entry.detail !== null).length;
    return html`
      <h3>收集结果</h3>
      <p role="status">${status}</p>
      <p class="counts">
        ${`已收集 ${entries.length} 笔订单 · 详情 ${details} 笔`}
      </p>
      <p>${`结果日期：${formatDate(startDate)} 至 ${formatDate(endDate)}`}</p>
    `;
  }
}
function formatDate(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? "不限";
}

customElements.define("pdd-export-result", ExportResult);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-export-result": ExportResult;
  }
}
