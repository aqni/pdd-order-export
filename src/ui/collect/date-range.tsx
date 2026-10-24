import { Component, createRef, createElement } from "preact";
import { DateField } from "./date-field";

/** 拥有日期草稿及校验；表单提交前可重新校验并读取日期值。 */
export class CollectDateRange extends Component {
  readonly #start = createRef<HTMLInputElement>();
  readonly #end = createRef<HTMLInputElement>();

  render() {
    return (
      <div class="fields" onInput={() => this.validate()}>
        <DateField name="startDate" label="开始日期" inputRef={this.#start} />
        <DateField name="endDate" label="结束日期" inputRef={this.#end} />
      </div>
    );
  }

  componentDidMount(): void {
    this.validate();
  }

  get value(): { startDate: Date | null; endDate: Date | null } {
    return {
      startDate: readDate(this.#start.current!),
      endDate: readDate(this.#end.current!),
    };
  }

  get description(): string {
    const start = this.#start.current!.value;
    const end = this.#end.current!.value;
    if (!start && !end) return "不限日期";
    return `${start || "不限"} 至 ${end || "不限"}`;
  }

  validate(): void {
    const start = this.#start.current!;
    const end = this.#end.current!;
    end.setCustomValidity(
      start.value && end.value && start.value > end.value
        ? "结束日期不能早于开始日期。"
        : "",
    );
  }
}

function readDate(input: HTMLInputElement): Date | null {
  // date 控件的数值表示 UTC 零点，空值表示不限日期。
  const timestamp = input.valueAsNumber;
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}
