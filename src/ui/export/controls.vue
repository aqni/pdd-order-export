<script setup lang="ts">
import type { CollectResult } from "../collect";
import ExportResult from "./result.vue";
import ExportDownload from "./download.vue";
defineProps<{ result: CollectResult | null }>();
</script>

<template>
  <div v-if="result" data-ui="export">
    <hr />
    <section aria-label="收集结果">
      <ExportResult :result="result" />
      <div class="exports" :hidden="!result.entries.length">
        <ExportDownload :result="result" format="csv" />
        <ExportDownload :result="result" format="json" />
      </div>
    </section>
  </div>
</template>

<style scoped>
section {
  display: grid;
  gap: 0.75em;
}
.exports {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
}
</style>
