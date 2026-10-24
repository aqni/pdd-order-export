import { Component, createRef, h } from "preact";

export class CollectDateRange extends Component {
  readonly #start = createRef<HTMLInputElement>();
  readonly #end = createRef<HTMLInputElement>();
  readonly #hint = `pdd-date-${crypto.randomUUID()}`;
  render() {
    return (
      <div data-ui="collect-dates" onInput={this.#constrain}>
        <div class="fields">
          <label>
            开始日期
            <input
              type="date"
              name="startDate"
              ref={this.#start}
              aria-describedby={this.#hint}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              name="endDate"
              ref={this.#end}
              aria-describedby={this.#hint}
            />
          </label>
        </div>
        <small id={this.#hint}>日期留空表示不限。</small>
      </div>
    );
  }
  get description() {
    const start = this.#start.current!.value,
      end = this.#end.current!.value;
    return !start && !end
      ? "不限日期"
      : `${start || "不限"} 至 ${end || "不限"}`;
  }
  read() {
    this.#constrain();
    return {
      startDate: readDate(this.#start.current!),
      endDate: readDate(this.#end.current!),
    };
  }
  #constrain = () => {
    this.#end.current!.min = this.#start.current!.value;
  };
}
function readDate(input: HTMLInputElement): Date | null {
  const time = input.valueAsNumber;
  return Number.isNaN(time) ? null : new Date(time);
}
