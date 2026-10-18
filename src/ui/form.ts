import { presetDates, type ExportOptions } from "../collect";
import baseStyle from "./styles.css?style";
import componentStyle from "./form.css?style";

export const formTag = "pdd-export-form";

/** A native form owns all draft values and emits collection options. */
export class ExportFormElement extends HTMLElement {
  #running = false;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set running(value: boolean) {
    this.#running = value;
    this.#renderRunning();
  }

  get running() {
    return this.#running;
  }

  connectedCallback() {
    if (this.shadowRoot!.childElementCount > 0) {
      return;
    }
    const root = this.shadowRoot!;
    const template = document.createElement("template");
    /** Markup is static project source. Dynamic values use DOM properties or textContent. */
    template.innerHTML = `
      <form>
        <fieldset>
          <legend>收集设置</legend>
          <div class="fields">
            <label>
              开始日期
              <input name="startDate" type="date" aria-describedby="date-help" autofocus />
            </label>
            <label>
              结束日期
              <input name="endDate" type="date" aria-describedby="date-help" />
            </label>
          </div>
          <p class="note" id="date-help">含起止日，留空不限；日期按订单号估算。</p>
          <p>
            <label class="check">
              <input name="includeDetails" type="checkbox" checked />
              包含支付与物流详情（较慢）
            </label>
          </p>
          <details class="advanced">
            <summary>高级选项</summary>
            <div class="fields">
              <label>
                每页订单数
                <input
                  name="pageSize"
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value="10"
                  required
                />
              </label>
              <label>
                最多读取页数
                <input
                  name="maxPages"
                  type="number"
                  min="1"
                  max="500"
                  step="1"
                  value="100"
                  required
                />
              </label>
            </div>
            <p class="note">
              达到页数上限时仅保留部分结果。
            </p>
          </details>
        </fieldset>
        <div class="actions">
          <button class="start" type="submit">开始收集</button>
          <button class="cancel" data-action="cancel" type="button" hidden>
            停止并保留结果
          </button>
        </div>
        <p class="note">收集完成后，选择导出 CSV 或 JSON。</p>
      </form>
    `;
    root.append(
      baseStyle.cloneNode(true),
      componentStyle.cloneNode(true),
      template.content,
    );
    const form = root.querySelector("form")!;
    const cancel = root.querySelector<HTMLButtonElement>(".cancel")!;
    const startDate = form.elements.namedItem("startDate") as HTMLInputElement;
    const endDate = form.elements.namedItem("endDate") as HTMLInputElement;
    const dates = presetDates("month");
    startDate.value = dates.startDate;
    endDate.value = dates.endDate;
    endDate.min = startDate.value;
    startDate.addEventListener("input", () => {
      endDate.min = startDate.value;
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (this.running || !form.reportValidity()) {
        return;
      }
      const values = new FormData(form);
      const detail: ExportOptions = {
        startDate: String(values.get("startDate") ?? ""),
        endDate: String(values.get("endDate") ?? ""),
        pageSize: Number(values.get("pageSize")),
        maxPages: Number(values.get("maxPages")),
        includeDetails: values.has("includeDetails"),
      };
      this.dispatchEvent(
        new CustomEvent<ExportOptions>("collect-request", {
          detail,
          bubbles: true,
          composed: true,
        }),
      );
    });
    cancel.addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("collect-cancel", { bubbles: true, composed: true }),
      );
    });
    this.#renderRunning();
  }

  #renderRunning() {
    const root = this.shadowRoot!;
    const form = root.querySelector("form");
    if (!form) {
      return;
    }
    const fieldset = root.querySelector("fieldset")!;
    const start = root.querySelector<HTMLButtonElement>(".start")!;
    const cancel = root.querySelector<HTMLButtonElement>(".cancel")!;
    fieldset.disabled = this.running;
    start.disabled = this.running;
    start.textContent = this.running ? "正在收集…" : "开始收集";
    cancel.hidden = !this.running;
    form.setAttribute("aria-busy", String(this.running));
  }

  disconnectedCallback() {
    this.#running = false;
    this.shadowRoot!.replaceChildren();
  }
}

if (!customElements.get(formTag)) {
  customElements.define(formTag, ExportFormElement);
}
