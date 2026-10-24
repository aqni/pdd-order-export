import { LitElement, html, css } from "lit";

/** 分页参数及其折叠、原生约束和无效字段提示。 */
class CollectRequestSettings extends LitElement {
  static styles = css`
    @scope {
      :scope {
        display: block;
      }
      summary {
        cursor: pointer;
      }
      details[open] > summary {
        margin-block-end: 0.75em;
      }
      .fields {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 9em), 1fr));
        gap: 0.75em 1em;
      }
      label {
        display: grid;
        gap: 0.25em;
      }
      input {
        box-sizing: border-box;
        font: inherit;
        min-inline-size: 0;
        max-inline-size: 100%;
        inline-size: 10ch;
      }
    }
  `;

  protected createRenderRoot() {
    return this;
  }

  protected render() {
    return html`
      <style>
        ${CollectRequestSettings.styles}
      </style>
      <details @invalid=${this.#invalidListener}>
        <summary>请求设置</summary>
        <div class="fields">
          <label>
            <span>每页订单数</span>
            <input
              name="pageSize"
              type="number"
              value="20"
              min="1"
              max="50"
              step="1"
              required
            />
          </label>
          <label title="达到页数上限时会停止收集，可导出部分结果。">
            <span>最多读取页数</span>
            <input
              name="maxPages"
              type="number"
              value="100"
              min="1"
              step="1"
              required
            />
          </label>
        </div>
      </details>
    `;
  }

  read() {
    return {
      pageSize:
        this.querySelector<HTMLInputElement>('[name="pageSize"]')!
          .valueAsNumber,
      maxPages:
        this.querySelector<HTMLInputElement>('[name="maxPages"]')!
          .valueAsNumber,
    };
  }

  readonly #invalidListener = {
    capture: true,
    handleEvent: () => {
      this.querySelector("details")!.open = true;
    },
  };
}

customElements.define("pdd-collect-request-settings", CollectRequestSettings);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-collect-request-settings": CollectRequestSettings;
  }
}
