<script setup lang="ts">
import { computed } from "vue";
import CollectDateRange from "./date-range.vue";
import CollectDetailsOption from "./details-option.vue";
import CollectRequestSettings from "./request-settings.vue";
import type { CollectDraft } from "../types";

const props = defineProps<{ draft: CollectDraft; disabled: boolean }>();
const expanded = defineModel<boolean>("expanded", { required: true });
const summary = computed(() => {
  const { startDate, endDate, includeDetails } = props.draft;
  const dates =
    !startDate && !endDate
      ? "不限日期"
      : `${startDate || "不限"} 至 ${endDate || "不限"}`;
  return dates + (includeDetails ? " · 含详情" : " · 仅列表");
});
function expand(event: Event) {
  (event.currentTarget as HTMLDetailsElement).open = true;
  expanded.value = true;
}
</script>

<template>
  <details
    data-ui="collect-settings"
    class="settings"
    :open="expanded"
    @toggle="expanded = ($event.currentTarget as HTMLDetailsElement).open"
    @invalid.capture="expand"
  >
    <summary>
      <span>收集设置</span><small>{{ summary }}</small>
    </summary>
    <fieldset :disabled="disabled">
      <CollectDateRange :draft="draft" />
      <CollectDetailsOption :draft="draft" />
      <CollectRequestSettings :draft="draft" />
    </fieldset>
  </details>
</template>

<style scoped>
fieldset {
  display: grid;
  gap: 1em;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
summary {
  cursor: pointer;
  font-weight: 600;
}
small {
  margin-inline-start: 0.75em;
  font-weight: normal;
  overflow-wrap: anywhere;
}
.settings[open] > summary {
  margin-block-end: 0.75em;
}
.settings[open] > summary small {
  display: none;
}
</style>
