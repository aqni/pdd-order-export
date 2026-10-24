import { Component, createRef, createElement } from "preact";
import type { collectOrders } from "../../collect";
import { CollectDetailsOption } from "./details-option";
import { CollectDateRange } from "./date-range";
import { CollectRequestSettings } from "./request-settings";

/** 原生控件保存草稿，任务状态只由宿主传入。 */
export class CollectForm extends Component<
  CollectFormProps,
  { scope: string }
> {
  state = { scope: "不限日期 · 含详情" };
  readonly #form = createRef<HTMLFormElement>();
  readonly #settings = createRef<HTMLDetailsElement>();
  readonly #dateRange = createRef<CollectDateRange>();

  render(props: CollectFormProps, { scope }: { scope: string }) {
    const { id, disabled } = props;
    return (
      <form
        id={id}
        ref={this.#form}
        onInput={this.#onInput}
        onSubmit={this.#onSubmit}
        onInvalidCapture={this.#showInvalidField}
      >
        <details class="settings" open ref={this.#settings}>
          <summary>
            <span>收集设置</span>
            <small class="scope">{scope}</small>
          </summary>
          <fieldset disabled={disabled}>
            <CollectDateRange ref={this.#dateRange} />
            <CollectDetailsOption />
            <CollectRequestSettings />
          </fieldset>
        </details>
      </form>
    );
  }

  componentDidMount(): void {
    this.#onInput();
  }

  componentDidUpdate(previous: CollectFormProps): void {
    if (this.props.disabled && !previous.disabled)
      this.#settings.current!.open = false;
  }

  #input(name: keyof Parameters<typeof collectOrders>[1]): HTMLInputElement {
    return this.#form.current!.elements.namedItem(name) as HTMLInputElement;
  }

  #onInput = () => {
    const scope =
      this.#dateRange.current!.description +
      (this.#input("includeDetails").checked ? " · 含详情" : " · 仅列表");
    if (scope !== this.state.scope) this.setState({ scope });
  };

  #showInvalidField = () => {
    this.#settings.current!.open = true;
  };

  #onSubmit = (event: Event) => {
    event.preventDefault();
    this.#dateRange.current!.validate();
    this.#onInput();
    if (this.props.disabled || !this.#form.current!.reportValidity()) return;
    this.props.onCollect({
      ...this.#dateRange.current!.value,
      pageSize: this.#input("pageSize").valueAsNumber,
      maxPages: this.#input("maxPages").valueAsNumber,
      includeDetails: this.#input("includeDetails").checked,
    });
  };
}

interface CollectFormProps {
  id: string;
  disabled: boolean;
  onCollect: (options: Parameters<typeof collectOrders>[1]) => void;
}
