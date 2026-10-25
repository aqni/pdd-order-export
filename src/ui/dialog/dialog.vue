<script setup lang="ts">
import { onBeforeUnmount, shallowRef } from "vue";
import ExportPositioner from "./positioner.vue";
const id = `pdd-dialog-${crypto.randomUUID()}`;
const dialog = shallowRef<HTMLDialogElement | null>(null);
onBeforeUnmount(() => dialog.value?.close());
</script>

<template>
  <div data-ui="dialog">
    <dialog :id="id" ref="dialog" :aria-labelledby="`${id}-title`">
      <div class="layout">
        <header>
          <h2 :id="`${id}-title`">订单导出</h2>
          <form method="dialog"><button type="submit">收起</button></form>
        </header>
        <div><slot /></div>
      </div>
    </dialog>
    <div class="launcher">
      <ExportPositioner>
        <button
          type="button"
          command="show-modal"
          :commandfor="id"
          title="点击打开，拖动调整位置"
        >
          导出账单
        </button>
      </ExportPositioner>
    </div>
  </div>
</template>

<style scoped>
dialog {
  box-sizing: border-box;
  color: inherit;
  font: inherit;
  inline-size: 28em;
  max-inline-size: calc(100vw - 24px);
  max-block-size: calc(100dvh - 24px);
}
.layout {
  display: grid;
  gap: 1em;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1em;
}
h2 {
  margin: 0;
  font-size: 1.125em;
}
dialog[open] + .launcher {
  display: none;
}
</style>
