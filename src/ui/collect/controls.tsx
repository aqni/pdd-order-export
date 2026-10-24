import { Component, Fragment, createRef, createElement } from "preact";
import { PddClient, PddError } from "../../pdd";
import { collectOrders, type CollectedOrder } from "../../collect";
import { CollectForm } from "./form";
import { CollectAction } from "./action";
import { CollectProgress, type CollectCounts } from "./progress";

/** 拥有收集任务、取消、进度和控件交互，向宿主通知开始及最终结果。 */
export class CollectControls extends Component<
  CollectControlsProps,
  CollectControlsState
> {
  state: CollectControlsState = { status: "idle", progress: null, error: null };
  readonly #formId = `pdd-collect-${crypto.randomUUID()}`;
  readonly #action = createRef<HTMLButtonElement>();
  #controller: AbortController | null = null;
  #disposed = false;

  render(
    _props: CollectControlsProps,
    { status, progress, error }: CollectControlsState,
  ) {
    const active = status === "collecting" || status === "cancelling";
    const message = error === null ? "" : describeError(error);
    return (
      <>
        <CollectForm
          id={this.#formId}
          disabled={active}
          onCollect={this.#startCollect}
        />
        <CollectAction
          form={this.#formId}
          buttonRef={this.#action}
          running={active}
          cancelling={status === "cancelling"}
          hasResult={status === "complete"}
          onCancel={this.cancel}
        />
        <p role="alert" hidden={!message}>
          {message}
        </p>
        {active && (
          <>
            <hr />
            <CollectProgress
              cancelling={status === "cancelling"}
              counts={progress}
            />
          </>
        )}
      </>
    );
  }

  getSnapshotBeforeUpdate(
    _props: CollectControlsProps,
    previous: CollectControlsState,
  ): boolean | null {
    if (
      this.state.status !== "collecting" ||
      previous.status === "collecting" ||
      previous.status === "cancelling"
    )
      return null;
    return this.#action.current!.form?.matches(":focus-within") ?? false;
  }

  componentDidUpdate(
    _props: CollectControlsProps,
    _state: CollectControlsState,
    moveFocus: boolean | null,
  ): void {
    if (moveFocus) this.#action.current!.focus({ preventScroll: true });
  }

  componentWillUnmount(): void {
    this.#disposed = true;
    this.#controller?.abort();
    this.#controller = null;
  }

  #startCollect = async (
    options: Parameters<typeof collectOrders>[1],
  ): Promise<void> => {
    if (this.#disposed || this.#controller) return;
    let client: PddClient;
    try {
      client = new PddClient();
    } catch (error) {
      this.setState({ error });
      return;
    }
    const controller = new AbortController();
    this.#controller = controller;
    this.setState({ status: "collecting", progress: null, error: null });
    this.props.onStart();
    const entries: CollectedOrder[] = [];
    let progress: CollectCounts = {
      pages: 0,
      orders: 0,
      details: 0,
      currentPage: null,
    };
    const publishProgress = () =>
      this.setState({
        status: controller.signal.aborted ? "cancelling" : "collecting",
        progress,
      });
    try {
      collection: for await (const { total, orders } of collectOrders(
        client,
        options,
        controller.signal,
      )) {
        if (controller !== this.#controller) return;
        if (controller.signal.aborted) break;
        let completed = 0;
        progress = {
          ...progress,
          pages: progress.pages + 1,
          currentPage: { completed, total },
        };
        publishProgress();
        for await (const entry of orders) {
          if (controller !== this.#controller) return;
          entries.push(entry);
          completed++;
          progress = {
            ...progress,
            orders: entries.length,
            details: progress.details + (entry.detail === null ? 0 : 1),
            currentPage: { completed, total },
          };
          publishProgress();
          if (controller.signal.aborted) break collection;
        }
        if (controller !== this.#controller) return;
        if (controller.signal.aborted) break;
        progress = { ...progress, currentPage: null };
        publishProgress();
      }
    } catch (error) {
      if (controller !== this.#controller) return;
      if (!controller.signal.aborted) {
        this.#controller = null;
        this.setState({ status: "idle", progress: null, error });
        this.props.onFinish(null);
        return;
      }
      // 取消时发布已收到的条目；其他异常已经在上面结束任务。
    }
    if (controller !== this.#controller) return;
    this.#controller = null;
    this.setState({ status: "complete", progress: null });
    this.props.onFinish({
      entries,
      partial: controller.signal.aborted || progress.pages >= options.maxPages,
      startDate: options.startDate,
      endDate: options.endDate,
    });
  };

  /** 同步确认是否存在任务，让尚未完成渲染的操作按钮也能立即停止。 */
  cancel = (): boolean => {
    const controller = this.#controller;
    if (!controller) return false;
    if (!controller.signal.aborted) {
      controller.abort();
      this.setState({ status: "cancelling" });
    }
    return true;
  };
}

export interface CollectResult {
  readonly entries: readonly CollectedOrder[];
  readonly partial: boolean;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
}

function describeError(error: unknown): string {
  if (error instanceof PddError) return error.message;
  return "操作失败，请稍后重试。";
}

interface CollectControlsProps {
  /** 客户端准备成功，开始一次新收集。 */
  onStart: () => void;
  /** 正常结束或取消时交出结果；null 表示失败，错误由本组件展示。 */
  onFinish: (result: CollectResult | null) => void;
}

interface CollectControlsState {
  status: "idle" | "collecting" | "cancelling" | "complete";
  progress: CollectCounts | null;
  error: unknown;
}
