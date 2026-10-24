import { LitElement, html, css } from "lit";
import { PddClient, PddError } from "../../pdd";
import { collectOrders, type CollectedOrder } from "../../collect";
import type { CollectOptions } from "./form";
import type { CollectCounts } from "./progress";
import "./form";
import "./feedback";

/** 收集区域完成任务后交付的结果快照。 */
export interface CollectResult {
  readonly entries: readonly CollectedOrder[];
  readonly partial: boolean;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
}

export type CollectionState =
  | {
      readonly status: "idle" | "complete";
      readonly progress: null;
      readonly error: string | null;
    }
  | {
      readonly status: "collecting" | "cancelling";
      readonly progress: CollectCounts | null;
      readonly error: null;
    };

/** 收集区域：封装表单、任务状态、取消、进度和错误。 */
export class CollectControls extends LitElement {
  static properties = { collection: { state: true } };
  static styles = css`
    :host {
      display: block;
    }
  `;
  declare protected collection: CollectionState;
  #controller: AbortController | null = null;
  #disposed = false;

  constructor() {
    super();
    this.collection = { status: "idle", progress: null, error: null };
  }

  protected render() {
    return html`
      <pdd-collect-form
        .status=${this.collection.status}
        @collect-action=${this.#cancel}
        @collect=${this.#collect}
      ></pdd-collect-form>
      <pdd-collect-feedback
        .collection=${this.collection}
      ></pdd-collect-feedback>
    `;
  }

  #finish(result: CollectResult | null, error: string | null = null) {
    this.#controller = null;
    this.collection = {
      status: result ? "complete" : "idle",
      progress: null,
      error,
    };
    this.dispatchEvent(new CustomEvent("collect-finish", { detail: result }));
  }

  connectedCallback() {
    super.connectedCallback();
    this.#disposed = false;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // 同步移动节点不打断任务；真正脱离文档后使旧请求失效。
    queueMicrotask(() => {
      if (!this.isConnected) this.dispose();
    });
  }

  dispose() {
    this.#disposed = true;
    const controller = this.#controller;
    this.#controller = null;
    controller?.abort();
    if (controller) this.#finish(null);
  }

  async #collect({
    detail: options,
  }: CustomEvent<CollectOptions>): Promise<void> {
    const client = this.#prepare();
    if (!client) return;
    const controller = new AbortController();
    const entries: CollectedOrder[] = [];
    this.#controller = controller;
    this.#showProgress(controller, null);
    this.dispatchEvent(new Event("collect-start"));
    try {
      await this.#readPages(client, options, controller, entries);
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
      partial:
        controller.signal.aborted ||
        (this.collection.progress?.pages ?? 0) >= options.maxPages,
      startDate: options.startDate,
      endDate: options.endDate,
    });
  }

  #prepare(): PddClient | null {
    const state = this.collection;
    if (
      this.#disposed ||
      !this.isConnected ||
      state.status === "collecting" ||
      state.status === "cancelling"
    )
      return null;
    try {
      return new PddClient();
    } catch (error) {
      // 会话准备失败时保留上一次结果，只有新任务真正开始才替换它。
      this.collection = {
        status: state.status,
        progress: null,
        error: describeError(error),
      };
      return null;
    }
  }

  /** 只消费分页与详情迭代器；生命周期和最终交付由调用方处理。 */
  async #readPages(
    client: PddClient,
    options: CollectOptions,
    controller: AbortController,
    entries: CollectedOrder[],
  ): Promise<void> {
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
      if (controller !== this.#controller) return;
      if (controller.signal.aborted) break;
      let completed = 0;
      progress = {
        ...progress,
        pages: progress.pages + 1,
        currentPage: { completed, total },
      };
      this.#showProgress(controller, progress);
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
        this.#showProgress(controller, progress);
        if (controller.signal.aborted) break collection;
      }
      if (controller !== this.#controller) return;
      if (controller.signal.aborted) break;
      progress = { ...progress, currentPage: null };
      this.#showProgress(controller, progress);
    }
  }

  #showProgress(controller: AbortController, progress: CollectCounts | null) {
    this.collection = {
      status: controller.signal.aborted ? "cancelling" : "collecting",
      progress,
      error: null,
    };
  }

  /** 同步确认任务是否存在，接管按钮尚未更新时的默认提交。 */
  #cancel(event: Event) {
    const controller = this.#controller;
    if (!controller) return;
    event.preventDefault();
    if (!controller.signal.aborted) {
      controller.abort();
      this.#showProgress(controller, this.collection.progress);
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof PddError) return error.message;
  return "操作失败，请稍后重试。";
}

customElements.define("pdd-collect-controls", CollectControls);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-collect-controls": CollectControls;
  }
}
