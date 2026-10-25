<script setup lang="ts">
import { onBeforeUnmount, shallowReactive } from "vue";
import { PddClient, PddError } from "../../pdd";
import { collectOrders, type CollectedOrder } from "../../collect";
import { CollectForm } from "./form";
import CollectFeedback from "./feedback.vue";
import type {
  CollectOptions,
  CollectResult,
  CollectCounts,
  CollectionState,
} from "./types";

const emit = defineEmits<{
  start: [];
  finish: [result: CollectResult | null];
}>();
const state = shallowReactive<CollectionState>({
  status: "idle",
  progress: null,
  error: null,
});
let controller: AbortController | null = null;
let disposed = false;

onBeforeUnmount(() => {
  disposed = true;
  controller?.abort();
  controller = null;
});

function prepare() {
  if (disposed || controller) return null;
  try {
    return new PddClient();
  } catch (error) {
    // 准备失败不触发开始通知，保留上一次可导出的结果。
    state.error = describeError(error);
    return null;
  }
}

function finish(result: CollectResult | null, error: string | null = null) {
  controller = null;
  Object.assign(state, {
    status: result ? "complete" : "idle",
    progress: null,
    error,
  });
  emit("finish", result);
}

async function collect(options: CollectOptions) {
  const client = prepare();
  if (!client) return;
  const active = new AbortController();
  controller = active;
  Object.assign(state, {
    status: "collecting",
    progress: null,
    error: null,
  });
  emit("start");
  const entries: CollectedOrder[] = [];
  let pages = 0;
  try {
    pages = await readPages(client, options, active, entries);
  } catch (error) {
    if (active !== controller) return;
    if (!active.signal.aborted) {
      finish(null, describeError(error));
      return;
    }
    // 取消时交付已收到的条目；普通请求失败不交付部分结果。
  }
  if (active !== controller) return;
  finish({
    entries,
    partial: active.signal.aborted || pages >= options.maxPages,
    startDate: options.startDate,
    endDate: options.endDate,
  });
}

async function readPages(
  client: PddClient,
  options: CollectOptions,
  active: AbortController,
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
    active.signal,
  )) {
    if (active !== controller || active.signal.aborted) break;
    let completed = 0;
    progress = {
      ...progress,
      pages: progress.pages + 1,
      currentPage: { completed, total },
    };
    publish(active, progress);
    for await (const entry of orders) {
      if (active !== controller) break collection;
      entries.push(entry);
      completed++;
      progress = {
        ...progress,
        orders: entries.length,
        details: progress.details + (entry.detail === null ? 0 : 1),
        currentPage: { completed, total },
      };
      publish(active, progress);
      if (active.signal.aborted) break collection;
    }
    if (active !== controller || active.signal.aborted) break;
    progress = { ...progress, currentPage: null };
    publish(active, progress);
  }
  return progress.pages;
}

function publish(active: AbortController, progress: CollectCounts) {
  state.status = active.signal.aborted ? "cancelling" : "collecting";
  state.progress = progress;
}

function cancel() {
  if (!controller) return false;
  if (!controller.signal.aborted) {
    controller.abort();
    state.status = "cancelling";
  }
  return true;
}

function describeError(error: unknown): string {
  return error instanceof PddError ? error.message : "操作失败，请稍后重试。";
}
</script>

<template>
  <div data-ui="collect">
    <CollectForm
      :status="state.status"
      :on-cancel="cancel"
      @collect="collect"
    />
    <CollectFeedback v-bind="state" />
  </div>
</template>
