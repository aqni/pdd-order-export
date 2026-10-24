import { LitElement, html, css } from "lit";

/** 日期草稿、起止约束及日期说明。原生输入留在所属表单的 DOM 树中。 */
class CollectDateRange extends LitElement {
  static styles = css`
    @scope {
      :scope {
        display: block;
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
        inline-size: 100%;
      }
      small {
        display: block;
        margin-block-start: 0.25em;
      }
    }
  `;
  readonly #hintId = `pdd-date-hint-${crypto.randomUUID()}`;

  protected createRenderRoot() {
    return this;
  }

  get #start() {
    return this.querySelector<HTMLInputElement>('[name="startDate"]')!;
  }
  get #end() {
    return this.querySelector<HTMLInputElement>('[name="endDate"]')!;
  }

  protected render() {
    return html`
      <style>
        ${CollectDateRange.styles}
      </style>
      <div class="fields" @input=${this.#syncConstraint}>
        ${this.#field("开始日期", "startDate")}
        ${this.#field("结束日期", "endDate")}
      </div>
      <small id=${this.#hintId}>日期留空表示不限。</small>
    `;
  }

  #field(label: string, name: string) {
    return html`
      <label>
        <span>${label}</span>
        <input name=${name} type="date" aria-describedby=${this.#hintId} />
      </label>
    `;
  }

  get description() {
    const start = this.#start.value;
    const end = this.#end.value;
    return !start && !end
      ? "不限日期"
      : `${start || "不限"} 至 ${end || "不限"}`;
  }

  read() {
    this.#syncConstraint();
    return { startDate: readDate(this.#start), endDate: readDate(this.#end) };
  }

  #syncConstraint = () => {
    this.#end.min = this.#start.value;
  };
}

function readDate(input: HTMLInputElement): Date | null {
  const timestamp = input.valueAsNumber;
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

customElements.define("pdd-collect-date-range", CollectDateRange);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-collect-date-range": CollectDateRange;
  }
}
