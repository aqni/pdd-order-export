import { Component, createRef, h } from "preact";
import type { collectOrders } from "../../../collect";
import { CollectSettings } from "./settings";
import { CollectAction } from "./action";

export type CollectOptions = Parameters<typeof collectOrders>[1];
export type CollectStatus = "idle" | "collecting" | "cancelling" | "complete";
interface Props {
  status: CollectStatus;
  onCollect: (options: CollectOptions) => void;
  onCancel: () => boolean;
}

/** 只协调原生提交、任务期间禁用和焦点；字段草稿留在内部组件。 */
export class CollectForm extends Component<Props> {
  readonly #id = `pdd-collect-${crypto.randomUUID()}`;
  readonly #form = createRef<HTMLFormElement>();
  readonly #settings = createRef<CollectSettings>();
  readonly #action = createRef<HTMLButtonElement>();

  render({ status, onCancel }: Props) {
    return (
      <div data-ui="collect-form">
        <form
          id={this.#id}
          ref={this.#form}
          aria-label="收集设置"
          onSubmit={this.#submit}
        >
          <CollectSettings
            ref={this.#settings}
            disabled={status === "collecting" || status === "cancelling"}
          />
        </form>
        <CollectAction
          form={this.#id}
          buttonRef={this.#action}
          status={status}
          onCancel={onCancel}
        />
      </div>
    );
  }
  getSnapshotBeforeUpdate(previous: Props) {
    return (
      this.props.status === "collecting" &&
      previous.status !== "collecting" &&
      this.#form.current!.matches(":focus-within")
    );
  }
  componentDidUpdate(previous: Props, _state: unknown, moveFocus: boolean) {
    if (
      this.props.status === "collecting" &&
      previous.status !== "collecting"
    ) {
      this.#settings.current!.collapse();
      if (moveFocus) this.#action.current!.focus({ preventScroll: true });
    }
  }
  #submit = (event: Event) => {
    event.preventDefault();
    if (
      this.props.status === "collecting" ||
      this.props.status === "cancelling"
    )
      return;
    const options = this.#settings.current!.read();
    if (this.#form.current!.reportValidity()) this.props.onCollect(options);
  };
}
