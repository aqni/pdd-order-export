import { Component, createRef, h } from "preact";
import type { collectOrders } from "../../../collect";
import { CollectSettings } from "./settings";
import { CollectAction } from "./action";

export type CollectOptions = Parameters<typeof collectOrders>[1];
export type CollectStatus = "idle" | "collecting" | "cancelling" | "complete";
/** 保留原生输入字符串，校验通过后才转换为采集选项。 */
export interface CollectDraft {
  startDate: string;
  endDate: string;
  includeDetails: boolean;
  pageSize: string;
  maxPages: string;
}
interface Props {
  status: CollectStatus;
  onCollect: (options: CollectOptions) => void;
  onCancel: () => boolean;
}

/** 表单拥有草稿和提交快照；字段只展示值，原生校验与焦点行为保留。 */
export class CollectForm extends Component<Props, CollectDraft> {
  state: CollectDraft = {
    startDate: "",
    endDate: "",
    includeDetails: true,
    pageSize: "20",
    maxPages: "100",
  };
  readonly #id = `pdd-collect-${crypto.randomUUID()}`;
  readonly #form = createRef<HTMLFormElement>();
  readonly #settings = createRef<HTMLDetailsElement>();
  readonly #action = createRef<HTMLButtonElement>();

  render({ status, onCancel }: Props, draft: CollectDraft) {
    return (
      <div data-ui="collect-form">
        <form
          id={this.#id}
          ref={this.#form}
          aria-label="收集设置"
          onInput={this.#updateDraft}
          onSubmit={this.#submit}
        >
          <CollectSettings
            draft={draft}
            detailsRef={this.#settings}
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
      this.#settings.current!.open = false;
      if (moveFocus) this.#action.current!.focus({ preventScroll: true });
    }
  }
  #readDraft(): CollectDraft {
    // 同一处读取覆盖普通输入、自动填充及未派发 input 的原生值更新。
    const native = this.#form.current!;
    const data = new FormData(native);
    const startDate = String(data.get("startDate") ?? "");
    // 同步更新约束，保证本次提交不必等待下一次渲染。
    (native.elements.namedItem("endDate") as HTMLInputElement).min = startDate;
    return {
      startDate,
      endDate: String(data.get("endDate") ?? ""),
      includeDetails: data.has("includeDetails"),
      pageSize: String(data.get("pageSize") ?? ""),
      maxPages: String(data.get("maxPages") ?? ""),
    };
  }
  #updateDraft = () => {
    if (
      this.props.status === "collecting" ||
      this.props.status === "cancelling"
    )
      return;
    this.setState(this.#readDraft());
  };
  #submit = (event: Event) => {
    event.preventDefault();
    if (
      this.props.status === "collecting" ||
      this.props.status === "cancelling"
    )
      return;
    const native = this.#form.current!;
    const draft = this.#readDraft();
    this.setState(draft);
    if (!native.reportValidity()) return;
    this.props.onCollect({
      startDate: readDate(native, "startDate"),
      endDate: readDate(native, "endDate"),
      includeDetails: draft.includeDetails,
      pageSize: Number(draft.pageSize),
      maxPages: Number(draft.maxPages),
    });
  };
}

function readDate(
  form: HTMLFormElement,
  name: "startDate" | "endDate",
): Date | null {
  const time = (form.elements.namedItem(name) as HTMLInputElement)
    .valueAsNumber;
  return Number.isNaN(time) ? null : new Date(time);
}
