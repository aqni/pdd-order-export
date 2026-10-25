<script setup lang="ts">
import type { CollectDraft } from "../types";
defineProps<{ draft: CollectDraft }>();
const hint = `pdd-date-${crypto.randomUUID()}`;
</script>

<template>
  <div data-ui="collect-dates">
    <div class="fields">
      <label
        >开始日期<input
          type="date"
          name="startDate"
          v-model="draft.startDate"
          :aria-describedby="hint"
      /></label>
      <label
        >结束日期<input
          type="date"
          name="endDate"
          v-model="draft.endDate"
          :min="draft.startDate"
          :aria-describedby="hint"
      /></label>
    </div>
    <small :id="hint">日期留空表示不限。</small>
  </div>
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
small {
  display: block;
  margin-block-start: 0.25em;
}
</style>
