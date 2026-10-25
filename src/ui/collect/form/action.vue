<script setup lang="ts">
import { shallowRef } from "vue";
import type { CollectStatus } from "../types";
defineProps<{ form: string; status: CollectStatus; onCancel: () => boolean }>();
const button = shallowRef<HTMLButtonElement | null>(null);
defineExpose({
  focus: (options?: FocusOptions) => button.value?.focus(options),
});
const labels: Record<CollectStatus, string> = {
  idle: "开始收集",
  collecting: "停止并保留结果",
  cancelling: "正在停止…",
  complete: "重新收集",
};
</script>

<template>
  <div data-ui="collect-action">
    <button
      ref="button"
      class="action"
      :form="form"
      :type="
        status === 'collecting' || status === 'cancelling' ? 'button' : 'submit'
      "
      :disabled="status === 'cancelling'"
      :title="status === 'complete' ? '重新收集会替换当前结果。' : ''"
      @click="onCancel() && $event.preventDefault()"
    >
      {{ labels[status] }}
    </button>
  </div>
</template>

<style scoped>
[data-ui="collect-action"] {
  display: flex;
}
</style>
