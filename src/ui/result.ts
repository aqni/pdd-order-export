import type { FileFormat } from "../export";
import type { TaskState } from "./model";
import baseStyle from "./styles.css?style";
import componentStyle from "./result.css?style";

export const resultTag = "pdd-export-result";

/** 展示任务结果，通过自定义事件发出导出请求，不执行文件转换。 */
export class ExportResultElement extends HTMLElement {
  #state?: TaskState;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set state(value: TaskState) {
    this.#state = value;
    this.#render();
  }

  get state(): TaskState | undefined {
    return this.#state;
  }

  connectedCallback() {
    if (this.shadowRoot!.childElementCount > 0) {
      return;
    }
    const root = this.shadowRoot!;
    const template = document.createElement("template");
    template.innerHTML = `
      <fieldset class="result">
        <legend>收集结果</legend>
        <p class="status" role="status" aria-live="polite"></p>
        <progress class="activity" aria-label="正在读取订单" hidden></progress>
        <p class="error" role="alert" hidden></p>
        <p class="counts" hidden></p>
        <p class="range" hidden></p>
        <div class="downloads actions" hidden>
          <button class="csv" data-action="csv" type="button" disabled>
            导出 CSV
          </button>
          <button class="json" data-action="json" type="button" disabled>
            导出 JSON
          </button>
        </div>
        <details>
          <summary>统计与说明</summary>
          <p class="statistics"></p>
        </details>
      </fieldset>
    `;
    root.append(
      baseStyle.cloneNode(true),
      componentStyle.cloneNode(true),
      template.content,
    );
    for (const format of ["csv", "json"] as const) {
      root
        .querySelector<HTMLButtonElement>("." + format)!
        .addEventListener("click", () => {
          this.dispatchEvent(
            new CustomEvent<FileFormat>("export-request", {
              detail: format,
              bubbles: true,
              composed: true,
            }),
          );
        });
    }
    this.#render();
  }

  #render() {
    const state = this.#state;
    const root = this.shadowRoot!;
    if (!state || root.childElementCount === 0) {
      return;
    }
    const status = root.querySelector<HTMLElement>(".status")!;
    const error = root.querySelector<HTMLElement>(".error")!;
    const counts = root.querySelector<HTMLElement>(".counts")!;
    const downloads = root.querySelector<HTMLElement>(".downloads")!;
    const range = root.querySelector<HTMLElement>(".range")!;
    const hasOrders = Boolean(state.result?.entries.length);
    const partial = Boolean(state.result && !state.result.complete);
    const collecting = state.running && !state.result;
    root.querySelector<HTMLElement>(".result")!.hidden =
      !state.running && !state.result && !state.error;

    const activity = root.querySelector<HTMLProgressElement>(".activity")!;
    activity.hidden = !collecting;
    // 接口不提供订单总量；仅当前页详情有可确定的完成比例。
    activity.removeAttribute("value");
    activity.setAttribute("aria-label", "读取进度：订单总量未知");
    status.textContent = state.status;
    if (collecting && state.progress && "current" in state.progress) {
      const current = state.progress.current;
      if (current.kind === "details") {
        status.textContent = `第 ${current.page} 页详情：已处理 ${current.completed}/${current.total}`;
        activity.max = Math.max(1, current.total);
        activity.value = current.completed;
        activity.setAttribute("aria-label", "本页详情读取进度");
      } else {
        status.textContent = `正在读取第 ${current.page} 页列表，总页数未知。`;
      }
    }
    status.hidden = Boolean(state.error) || (!state.running && !state.result);
    status.classList.toggle("warning", partial);
    error.textContent = state.error;
    error.hidden = !state.error;
    range.hidden = !state.result;
    if (state.result) {
      const { startDate, endDate } = state.result.options;
      range.textContent =
        !startDate && !endDate
          ? "订单日期：不限"
          : `订单日期：${startDate || "不限"} 至 ${endDate || "不限"}`;
    }
    root.querySelector("details")!.hidden = !hasOrders;
    const progress = state.progress ?? state.result?.progress;
    counts.hidden = !collecting || !progress;
    if (progress) {
      const statistics = [
        `已读 ${progress.pages} 页`,
        `检查 ${progress.scanned} 笔`,
        `保留 ${progress.selected} 笔`,
      ];
      counts.textContent = statistics.join(" · ");
      root.querySelector<HTMLElement>(".statistics")!.textContent =
        counts.textContent;
    }
    downloads.hidden = !state.result?.entries.length;
    for (const format of ["csv", "json"] as const) {
      const button = root.querySelector<HTMLButtonElement>(`.${format}`)!;
      button.disabled = state.running || !state.result?.entries.length;
      const label = `导出 ${format.toUpperCase()}`;
      button.textContent = partial
        ? `导出部分 ${format.toUpperCase()}（不完整）`
        : label;
    }
  }

  disconnectedCallback() {
    this.#state = undefined;
    this.shadowRoot!.replaceChildren();
  }
}

if (!customElements.get(resultTag)) {
  customElements.define(resultTag, ExportResultElement);
}
