<script setup lang="ts">
import { computed } from "vue";
import CollectProgress from "./progress.vue";
import type { CollectionState } from "./types";
const props = defineProps<CollectionState>();
const active = computed(
  () => props.status === "collecting" || props.status === "cancelling",
);
</script>

<template>
  <div data-ui="collect-feedback">
    <p role="alert" :hidden="!error">{{ error }}</p>
    <hr :hidden="!active" />
    <CollectProgress
      v-if="active"
      :cancelling="status === 'cancelling'"
      :counts="progress"
    />
  </div>
</template>

<style scoped>
[role="alert"] {
  margin-block: 1em 0;
  color: #a11;
  overflow-wrap: anywhere;
}
</style>
