<script setup lang="ts">
import type { CollectDraft } from "../types";
defineProps<{ draft: CollectDraft }>();
const hint = `pdd-date-${crypto.randomUUID()}`;
</script>

<template>
  <div data-ui="collect-dates" class="field-group">
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
