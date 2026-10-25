<script setup lang="ts">
import type { CollectDraft } from "../types";
defineProps<{ draft: CollectDraft }>();
function expand(event: Event) {
  (event.currentTarget as HTMLDetailsElement).open = true;
}
</script>

<template>
  <details
    data-ui="collect-requests"
    class="field-group"
    @invalid.capture="expand"
  >
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
