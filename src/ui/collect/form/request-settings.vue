<script setup lang="ts">
import type { CollectDraft } from "../types";
defineProps<{ draft: CollectDraft }>();
function expand(event: Event) {
  (event.currentTarget as HTMLDetailsElement).open = true;
}
</script>

<template>
  <details data-ui="collect-requests" @invalid.capture="expand">
    <summary>请求设置</summary>
    <div class="fields">
      <label
        >每页订单数<input
          name="pageSize"
          type="number"
          v-model="draft.pageSize"
          min="1"
          max="50"
          required
      /></label>
      <label title="达到页数上限时会停止收集，可导出部分结果。"
        >最多读取页数<input
          name="maxPages"
          type="number"
          v-model="draft.maxPages"
          min="1"
          required
      /></label>
    </div>
  </details>
</template>

<style scoped>
.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 9em), 1fr));
  gap: 0.75em 1em;
}
label {
  display: grid;
  gap: 0.25em;
}
input {
  min-inline-size: 0;
  inline-size: 100%;
}
summary {
  cursor: pointer;
}
details[open] > summary {
  margin-block-end: 0.75em;
}
</style>
