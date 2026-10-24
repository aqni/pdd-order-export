import { LitElement, html } from "lit";

/** 详情选项的原生勾选状态和说明。 */
class CollectDetailsOption extends LitElement {
  protected createRenderRoot() {
    return this;
  }

  protected render() {
    return html`
      <label title="逐笔读取支付、物流等详情，收集时间会更长。">
        <input name="includeDetails" type="checkbox" checked />
        收集详情
      </label>
    `;
  }

  get checked() {
    return this.querySelector("input")!.checked;
  }

  get description() {
    return this.checked ? "含详情" : "仅列表";
  }
}

customElements.define("pdd-collect-details-option", CollectDetailsOption);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-collect-details-option": CollectDetailsOption;
  }
}
