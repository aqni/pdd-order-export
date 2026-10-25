<script setup lang="ts">
import { shallowRef } from "vue";
import { CollectControls, type CollectResult } from "./collect";
import { ExportControls } from "./export";
import { ExportDialog } from "./dialog";

// 宿主的 id 等属性留在自定义元素上，不再透传到内部根节点。
defineOptions({ inheritAttrs: false });

// 结果保持浅引用，进度更新留在收集区域。
const result = shallowRef<CollectResult | null>(null);
function setResult(value: CollectResult | null) {
  result.value = value;
}
</script>

<template>
  <div data-ui="panel">
    <ExportDialog>
      <CollectControls @start="setResult(null)" @finish="setResult" />
      <ExportControls :result="result" />
    </ExportDialog>
  </div>
</template>

<style scoped>
[data-ui="panel"] {
  color-scheme: light;
  color: CanvasText;
  text-align: left;
  font: medium/1.5 system-ui;
}
</style>

<style>
:host {
  all: initial;
  display: block;
}
button,
input {
  box-sizing: border-box;
  font: inherit;
  max-inline-size: 100%;
}
[hidden] {
  display: none !important;
}
hr {
  margin-block: 1em;
}
</style>
