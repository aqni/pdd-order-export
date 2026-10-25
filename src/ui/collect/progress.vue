<script setup lang="ts">
import { computed } from "vue";
import type { CollectCounts } from "./types";
const props = defineProps<{
  cancelling: boolean;
  counts: CollectCounts | null;
}>();
const page = computed(() => props.counts?.currentPage);
const determinate = computed(() => !!page.value && page.value.total > 0);
const message = computed(() =>
  props.cancelling
    ? "正在停止收集…"
    : page.value
      ? `正在处理第 ${props.counts?.pages ?? 1} 页订单（${page.value.completed}/${page.value.total}）…`
      : `正在读取第 ${(props.counts?.pages ?? 0) + 1} 页订单…`,
);
</script>

<template>
  <section
    data-ui="collect-progress"
    class="summary-block"
    aria-label="收集进度"
  >
    <h3>收集进度</h3>
    <p role="status">{{ message }}</p>
    <progress
      :aria-label="
        determinate ? '本页订单读取进度' : '订单分页读取进度：总量未知'
      "
      :value="determinate ? page!.completed : undefined"
      :max="determinate ? page!.total : undefined"
    />
    <p class="counts">
      {{
        counts
          ? `已读 ${counts.pages} 页 · 保留 ${counts.orders} 笔 · 详情 ${counts.details} 笔`
          : ""
      }}
    </p>
  </section>
</template>
