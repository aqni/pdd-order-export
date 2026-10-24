import { LitElement, html, css, type PropertyValues } from "lit";
import type { collectOrders } from "../../../collect";
import "./settings";
import "./action";

export type CollectOptions = Parameters<typeof collectOrders>[1];
export type CollectStatus = "idle" | "collecting" | "cancelling" | "complete";

/** 组合字段组件，协调原生提交、任务状态和焦点。草稿保存在各字段内。 */
export class CollectForm extends LitElement {
  static properties = { status: { attribute: false } };
  static styles = css`
    :host {
      display: grid;
      gap: 1em;
    }
  `;
  declare status: CollectStatus;
  readonly #formId = `pdd-collect-${crypto.randomUUID()}`;
  #moveFocus = false;
  constructor() {
    super();
    this.status = "idle";
  }
  get #form() {
    return this.renderRoot.querySelector("form")!;
  }
  get #active() {
    return this.status === "collecting" || this.status === "cancelling";
  }
  protected render() {
    return html`
      <form id=${this.#formId} aria-label="收集设置" @submit=${this.#onSubmit}>
        <pdd-collect-settings .disabled=${this.#active}></pdd-collect-settings>
      </form>
      <pdd-collect-action
        .formId=${this.#formId}
        .status=${this.status}
      ></pdd-collect-action>
    `;
  }
  get #settings() {
    return this.#form.querySelector("pdd-collect-settings")!;
  }
  protected willUpdate(changed: PropertyValues<this>) {
    if (this.status === "collecting" && changed.has("status"))
      this.#moveFocus = this.#form?.matches(":focus-within") ?? false;
  }
  protected updated(changed: PropertyValues<this>) {
    if (this.status === "collecting" && changed.has("status")) {
      this.#settings.collapse();
      if (this.#moveFocus)
        this.renderRoot
          .querySelector("pdd-collect-action")!
          .focus({ preventScroll: true });
      this.#moveFocus = false;
    }
  }
  #onSubmit = (event: Event) => {
    event.preventDefault();
    const options = this.#settings.read();
    if (this.#active || !this.#form.reportValidity()) return;
    this.dispatchEvent(new CustomEvent("collect", { detail: options }));
  };
}
customElements.define("pdd-collect-form", CollectForm);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-collect-form": CollectForm;
  }
}
