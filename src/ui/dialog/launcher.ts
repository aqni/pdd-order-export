import { LitElement, html, css } from "lit";
import "./positioner";

/** 原生模态窗口入口；浮动位置由内部定位组件管理。 */
class ExportLauncher extends LitElement {
  static properties = { target: { attribute: false } };
  static styles = css`
    :host {
      display: block;
    }
    button {
      box-sizing: border-box;
      max-inline-size: 100%;
      font: inherit;
    }
  `;
  declare target: HTMLDialogElement | null;

  constructor() {
    super();
    this.target = null;
  }

  protected render() {
    return html`
      <pdd-export-positioner>
        <button
          type="button"
          command="show-modal"
          .commandForElement=${this.target}
          title="点击打开，拖动调整位置"
        >
          导出账单
        </button>
      </pdd-export-positioner>
    `;
  }
}

customElements.define("pdd-export-launcher", ExportLauncher);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-export-launcher": ExportLauncher;
  }
}
