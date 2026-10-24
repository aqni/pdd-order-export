import { LitElement, html, css } from "lit";
import type { CollectOptions } from "./form";
import "./date-range";
import "./details-option";
import "./request-settings";

/** 组合收集选项，维护折叠摘要；各字段自行持有草稿和约束。 */
class CollectSettings extends LitElement {
  static properties = {
    disabled: { type: Boolean },
    summary: { state: true },
  };
  static styles = css`
    @scope to (pdd-collect-date-range, pdd-collect-details-option, pdd-collect-request-settings) {
      :scope {
        display: block;
      }
      fieldset {
        display: grid;
        gap: 1em;
        min-inline-size: 0;
        margin: 0;
        padding: 0;
        border: 0;
      }
      summary {
        cursor: pointer;
        font-weight: 600;
      }
      small {
        margin-inline-start: 0.75em;
        font-weight: normal;
        overflow-wrap: anywhere;
      }
      details[open] {
        > summary {
          margin-block-end: 0.75em;
        }
        small {
          display: none;
        }
      }
    }
  `;
  declare disabled: boolean;
  declare protected summary: string;

  constructor() {
    super();
    this.disabled = false;
    this.summary = "不限日期 · 含详情";
  }

  protected createRenderRoot() {
    return this;
  }

  get #details() {
    return this.renderRoot.querySelector("details")!;
  }
  get #dates() {
    return this.querySelector("pdd-collect-date-range")!;
  }
  get #detailsOption() {
    return this.querySelector("pdd-collect-details-option")!;
  }

  protected render() {
    return html`
      <style>
        ${CollectSettings.styles}
      </style>
      <details class="settings" open @invalid=${this.#invalidListener}>
        <summary><span>收集设置</span><small>${this.summary}</small></summary>
        <fieldset ?disabled=${this.disabled} @input=${this.#updateSummary}>
          <pdd-collect-date-range></pdd-collect-date-range>
          <pdd-collect-details-option></pdd-collect-details-option>
          <pdd-collect-request-settings></pdd-collect-request-settings>
        </fieldset>
      </details>
    `;
  }

  collapse() {
    this.#details.open = false;
  }

  read(): CollectOptions {
    const dates = this.#dates.read();
    this.#updateSummary();
    return {
      ...dates,
      ...this.querySelector("pdd-collect-request-settings")!.read(),
      includeDetails: this.#detailsOption.checked,
    };
  }

  #updateSummary = () => {
    this.summary = `${this.#dates.description} · ${this.#detailsOption.description}`;
  };

  readonly #invalidListener = {
    capture: true,
    handleEvent: () => {
      // 同步展开，让浏览器随后能聚焦并提示无效的原生字段。
      this.#details.open = true;
    },
  };
}

customElements.define("pdd-collect-settings", CollectSettings);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-collect-settings": CollectSettings;
  }
}
