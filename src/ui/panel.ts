import { LitElement, html, css, nothing, render } from "lit";
import type { CollectResult } from "./collect";
import "./collect";
import "./export";
import "./dialog";

/** 连接收集、导出和弹层的公开接口，不保存各区域的状态副本。 */
export class ExportPanel extends LitElement {
  static styles = css`
    :host {
      all: initial;
      display: block;
    }
  `;
  #disposed = false;

  protected render() {
    if (this.#disposed) return nothing;
    return html`
      <pdd-export-dialog>
        <pdd-collect-controls
          @collect-start=${this.#onStart}
          @collect-finish=${this.#onFinish}
        ></pdd-collect-controls>
        <pdd-export-controls></pdd-export-controls>
      </pdd-export-dialog>
    `;
  }

  get #exports() {
    return this.renderRoot.querySelector("pdd-export-controls")!;
  }

  #onStart() {
    this.#exports.result = null;
  }

  #onFinish(event: CustomEvent<CollectResult | null>) {
    this.#exports.result = event.detail;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.renderRoot.querySelector("pdd-collect-controls")?.dispose();
    this.renderRoot.querySelector("pdd-export-dialog")?.dispose();
    render(nothing, this.renderRoot);
    this.renderRoot.replaceChildren();
    this.remove();
  }
}

customElements.define("pdd-export-panel", ExportPanel);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-export-panel": ExportPanel;
  }
}
