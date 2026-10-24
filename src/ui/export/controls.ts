import { LitElement, html, css, nothing } from "lit";
import type { CollectResult } from "../collect";
import "./result";
import "./download";

/** 导出区域持有已交付的结果，内部组件只接收展示和下载所需的快照。 */
export class ExportControls extends LitElement {
  static properties = { result: { attribute: false } };
  static styles = css`
    :host {
      display: block;
    }
    hr {
      margin-block: 1em;
    }
    section {
      display: grid;
      gap: 0.75em;
    }
    .exports {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5em;

      &[hidden] {
        display: none;
      }
    }
  `;
  declare result: CollectResult | null;

  constructor() {
    super();
    this.result = null;
  }

  protected render() {
    const result = this.result;
    if (!result) return nothing;
    return html`
      <hr />
      <section aria-label="收集结果">
        <pdd-export-result .result=${result}></pdd-export-result>
        <div class="exports" ?hidden=${!result.entries.length}>
          ${["csv", "json"].map(
            (format) => html`
              <pdd-export-download
                .result=${result}
                .format=${format}
              ></pdd-export-download>
            `,
          )}
        </div>
      </section>
    `;
  }
}

customElements.define("pdd-export-controls", ExportControls);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-export-controls": ExportControls;
  }
}
