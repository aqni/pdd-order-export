import { LitElement, html, css } from "lit";
import type { CollectStatus } from "./form";

const labels: Record<CollectStatus, string> = {
  idle: "开始收集",
  collecting: "停止并保留结果",
  cancelling: "正在停止…",
  complete: "重新收集",
};

/** 提交与停止按钮，使用原生 form 关联；取消通知在默认提交之前同步处理。 */
class CollectAction extends LitElement {
  static properties = {
    status: { attribute: false },
    formId: { attribute: false },
  };
  static styles = css`
    @scope {
      :scope {
        display: flex;
      }
      button {
        box-sizing: border-box;
        font: inherit;
        max-inline-size: 100%;
      }
    }
  `;
  declare status: CollectStatus;
  declare formId: string;

  constructor() {
    super();
    this.status = "idle";
    this.formId = "";
  }

  protected createRenderRoot() {
    return this;
  }

  protected render() {
    const active = this.status === "collecting" || this.status === "cancelling";
    return html`
      <style>
        ${CollectAction.styles}
      </style>
      <button
        class="action"
        form=${this.formId}
        type=${active ? "button" : "submit"}
        ?disabled=${this.status === "cancelling"}
        title=${this.status === "complete" ? "重新收集会替换当前结果。" : ""}
        @click=${this.#onClick}
      >
        ${labels[this.status]}
      </button>
    `;
  }

  focus(options?: FocusOptions) {
    this.querySelector("button")!.focus(options);
  }

  #onClick(event: Event) {
    // 同一事件跨越表单的 Shadow Root，取消后阻止按钮的默认提交。
    if (
      !this.dispatchEvent(
        new Event("collect-action", {
          bubbles: true,
          composed: true,
          cancelable: true,
        }),
      )
    )
      event.preventDefault();
  }
}

customElements.define("pdd-collect-action", CollectAction);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-collect-action": CollectAction;
  }
}
