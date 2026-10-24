import { LitElement, html, css, nothing } from "lit";
import type { CollectionState } from "./controls";
import "./progress";

/** 收集反馈的展示边界；任务和取消状态仍由收集区域持有。 */
class CollectFeedback extends LitElement {
  static properties = { collection: { attribute: false } };
  static styles = css`
    :host {
      display: block;
    }
    [role="alert"] {
      margin-block: 0.75em 0;
      overflow-wrap: anywhere;
      font-weight: 600;
    }
    hr {
      margin-block: 1em;
    }
  `;
  declare collection: CollectionState;

  constructor() {
    super();
    this.collection = { status: "idle", progress: null, error: null };
  }

  protected render() {
    const { status, progress, error } = this.collection;
    const active = status === "collecting" || status === "cancelling";
    return html`
      <p role="alert" ?hidden=${!error}>${error}</p>
      <hr ?hidden=${!active} />
      ${
        active
          ? html`
              <pdd-collect-progress
                .cancelling=${status === "cancelling"}
                .counts=${progress}
              ></pdd-collect-progress>
            `
          : nothing
      }
    `;
  }
}

customElements.define("pdd-collect-feedback", CollectFeedback);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-collect-feedback": CollectFeedback;
  }
}
