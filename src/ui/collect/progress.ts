import { LitElement, html, css, nothing } from "lit";

export interface CollectCounts {
  readonly pages: number;
  readonly orders: number;
  readonly details: number;
  readonly currentPage: {
    readonly completed: number;
    readonly total: number;
  } | null;
}

class CollectProgress extends LitElement {
  static properties = {
    cancelling: { type: Boolean },
    counts: { attribute: false },
  };
  static styles = css`
    :host {
      display: block;
    }
    section {
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
    progress {
      inline-size: 100%;
    }
    .counts {
      font-variant-numeric: tabular-nums;
    }
  `;
  declare cancelling: boolean;
  declare counts: CollectCounts | null;
  constructor() {
    super();
    this.cancelling = false;
    this.counts = null;
  }
  protected render() {
    const { cancelling, counts } = this;
    const page = counts?.currentPage;
    const determinate = page !== null && page !== undefined && page.total > 0;
    return html`
      <section aria-label="收集进度">
        <h3>收集进度</h3>
        <p role="status">
          ${cancelling ? "正在停止收集…" : page ? `正在处理第 ${counts?.pages ?? 1} 页订单（${page.completed}/${page.total}）…` : `正在读取第 ${(counts?.pages ?? 0) + 1} 页订单…`}
        </p>
        <progress
          aria-label=${determinate ? "本页订单读取进度" : "订单分页读取进度：总量未知"}
          value=${determinate ? page.completed : nothing}
          max=${determinate ? page.total : nothing}
        ></progress>
        <p class="counts">
          ${counts ? `已读 ${counts.pages} 页 · 保留 ${counts.orders} 笔 · 详情 ${counts.details} 笔` : ""}
        </p>
      </section>
    `;
  }
}
customElements.define("pdd-collect-progress", CollectProgress);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-collect-progress": CollectProgress;
  }
}
