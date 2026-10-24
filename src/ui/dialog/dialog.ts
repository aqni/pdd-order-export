import { LitElement, html, css } from "lit";
import "./launcher";

/** 原生弹层和触发按钮，使用 slot 组合具有独立样式的内容组件。 */
export class ExportDialog extends LitElement {
  static styles = css`
    :host {
      display: block;
      color-scheme: light;
      color: CanvasText;
      text-align: left;
      font: medium/1.5 system-ui;
    }
    button {
      font: inherit;
      max-inline-size: 100%;
    }
    dialog {
      box-sizing: border-box;
      color: inherit;
      font: inherit;
      inline-size: 28em;
      max-inline-size: calc(100vw - 24px);
      max-block-size: calc(100dvh - 24px);
    }
    .layout {
      display: grid;
      gap: 1em;
    }
    .content {
      min-inline-size: 0;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1em;
    }
    h2 {
      margin: 0;
      font-size: 1.125em;
    }
    dialog[open] + pdd-export-launcher {
      display: none;
    }
  `;
  protected render() {
    return html`
      <dialog aria-labelledby="title">
        <div class="layout">
          <header>
            <h2 id="title">订单导出</h2>
            <form method="dialog">
              <button type="submit">收起</button>
            </form>
          </header>
          <div class="content"><slot></slot></div>
        </div>
      </dialog>
      <pdd-export-launcher></pdd-export-launcher>
    `;
  }
  protected firstUpdated() {
    // 原生元素引用可指向祖先 Shadow Root，避免 commandfor 字符串 ID 的作用域限制。
    this.renderRoot.querySelector("pdd-export-launcher")!.target =
      this.renderRoot.querySelector("dialog")!;
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    queueMicrotask(() => {
      if (!this.isConnected) this.dispose();
    });
  }
  dispose() {
    this.renderRoot.querySelector("dialog")?.close();
  }
}
customElements.define("pdd-export-dialog", ExportDialog);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-export-dialog": ExportDialog;
  }
}
