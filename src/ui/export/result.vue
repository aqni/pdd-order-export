<script setup lang="ts">
import { computed } from "vue";
import type { CollectResult } from "../collect";
const props = defineProps<{ result: CollectResult }>();
const status = computed(() =>
  props.result.partial
    ? "结果不完整，已保留收到的订单。"
    : props.result.entries.length
      ? "收集完成。"
      : "未找到订单，请调整日期范围。",
);
const details = computed(
  () => props.result.entries.filter((entry) => entry.detail !== null).length,
);
const counts = computed(
  () =>
    `已收集 ${props.result.entries.length} 笔订单 · 详情 ${details.value} 笔`,
);
function formatDate(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? "不限";
}
</script>

<template>
  <div data-ui="export-result" class="summary-block">
    <h3>收集结果</h3>
    <p role="status">{{ status }}</p>
    <p class="counts">{{ counts }}</p>
    <p>
      结果日期：{{ formatDate(result.startDate) }} 至
      {{ formatDate(result.endDate) }}
    </p>
  </div>
</template>
