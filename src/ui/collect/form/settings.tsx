import { Component, createRef, h } from "preact";
import { CollectDateRange } from "./date-range";
import { CollectDetailsOption } from "./details-option";
import { CollectRequestSettings } from "./request-settings";
import type { CollectOptions } from "./form";

/** 组合字段和折叠摘要，通过组件接口读取选项。 */
export class CollectSettings extends Component<
  { disabled: boolean },
  { summary: string }
> {
  state = { summary: "不限日期 · 含详情" };
  readonly #details = createRef<HTMLDetailsElement>();
  readonly #dates = createRef<CollectDateRange>();
  readonly #includeDetails = createRef<CollectDetailsOption>();
  readonly #requests = createRef<CollectRequestSettings>();

  render(
    { disabled }: { disabled: boolean },
    { summary }: { summary: string },
  ) {
    return (
      <details
        data-ui="collect-settings"
        class="settings"
        open
        ref={this.#details}
        onInput={this.#summarize}
        onInvalidCapture={() => {
          this.#details.current!.open = true;
        }}
      >
        <summary>
          <span>收集设置</span>
          <small>{summary}</small>
        </summary>
        <fieldset disabled={disabled}>
          <CollectDateRange ref={this.#dates} />
          <CollectDetailsOption ref={this.#includeDetails} />
          <CollectRequestSettings ref={this.#requests} />
        </fieldset>
      </details>
    );
  }
  collapse() {
    this.#details.current!.open = false;
  }
  read(): CollectOptions {
    this.#summarize();
    return {
      ...this.#dates.current!.read(),
      ...this.#requests.current!.read(),
      includeDetails: this.#includeDetails.current!.checked,
    };
  }
  #summarize = () => {
    const summary =
      this.#dates.current!.description +
      (this.#includeDetails.current!.checked ? " · 含详情" : " · 仅列表");
    if (summary !== this.state.summary) this.setState({ summary });
  };
}
