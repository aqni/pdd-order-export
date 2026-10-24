import { Component, h } from "preact";
import { PddClient, PddError } from "../../pdd";
import { collectOrders, type CollectedOrder } from "../../collect";
import { CollectForm, type CollectOptions, type CollectStatus } from "./form";
import { CollectFeedback } from "./feedback";
import type { CollectCounts } from "./progress";

/** 收集区域拥有任务、取消和进度，只向外交付结果快照。 */
export class CollectControls extends Component<
  {
    onStart: () => void;
    onFinish: (result: CollectResult | null) => void;
  },
  CollectionState
> {
  state: CollectionState = { status: "idle", progress: null, error: null };
  #controller: AbortController | null = null;
  #disposed = false;

  render() {
    return (
      <div data-ui="collect">
        <CollectForm
          status={this.state.status}
          onCollect={this.#collect}
          onCancel={this.#cancel}
        />
        <CollectFeedback {...this.state} />
      </div>
    );
  }
  componentWillUnmount() {
    this.#disposed = true;
    this.#controller?.abort();
    this.#controller = null;
  }
  #prepare() {
    if (this.#disposed || this.#controller) return null;
    try {
      return new PddClient();
    } catch (error) {
      // 准备失败不触发开始通知，保留上一次可导出的结果。
      this.setState({ error: describeError(error) });
      return null;
    }
  }
  #finish(result: CollectResult | null, error: string | null = null) {
    this.#controller = null;
    this.setState({
      status: result ? "complete" : "idle",
      progress: null,
      error,
    });
    this.props.onFinish(result);
  }
  #collect = async (options: CollectOptions) => {
    const client = this.#prepare();
    if (!client) return;
    const controller = new AbortController();
    this.#controller = controller;
    this.setState({ status: "collecting", progress: null, error: null });
    this.props.onStart();
    const entries: CollectedOrder[] = [];
    let pages = 0;
    try {
      pages = await this.#readPages(client, options, controller, entries);
    } catch (error) {
      if (controller !== this.#controller) return;
      if (!controller.signal.aborted) {
        this.#finish(null, describeError(error));
        return;
      }
      // 取消时交付已收到的条目；普通请求失败不交付部分结果。
    }
    if (controller !== this.#controller) return;
    this.#finish({
      entries,
      partial: controller.signal.aborted || pages >= options.maxPages,
      startDate: options.startDate,
      endDate: options.endDate,
    });
  };
  async #readPages(
    client: PddClient,
    options: CollectOptions,
    controller: AbortController,
    entries: CollectedOrder[],
  ) {
    let progress: CollectCounts = {
      pages: 0,
      orders: 0,
      details: 0,
      currentPage: null,
    };
    collection: for await (const { total, orders } of collectOrders(
      client,
      options,
      controller.signal,
    )) {
      if (controller !== this.#controller || controller.signal.aborted) break;
      let completed = 0;
      progress = {
        ...progress,
        pages: progress.pages + 1,
        currentPage: { completed, total },
      };
      this.#publish(controller, progress);
      for await (const entry of orders) {
        if (controller !== this.#controller) break collection;
        entries.push(entry);
        completed++;
        progress = {
          ...progress,
          orders: entries.length,
          details: progress.details + (entry.detail === null ? 0 : 1),
          currentPage: { completed, total },
        };
        this.#publish(controller, progress);
        if (controller.signal.aborted) break collection;
      }
      if (controller !== this.#controller || controller.signal.aborted) break;
      progress = { ...progress, currentPage: null };
      this.#publish(controller, progress);
    }
    return progress.pages;
  }
  #publish(controller: AbortController, progress: CollectCounts) {
    this.setState({
      status: controller.signal.aborted ? "cancelling" : "collecting",
      progress,
    });
  }
  #cancel = () => {
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
export interface CollectionState {
  status: CollectStatus;
  progress: CollectCounts | null;
  error: string | null;
}
function describeError(error: unknown): string {
  return error instanceof PddError ? error.message : "操作失败，请稍后重试。";
}
