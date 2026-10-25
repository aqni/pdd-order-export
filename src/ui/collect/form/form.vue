<script setup lang="ts">
import { computed, nextTick, reactive, shallowRef, watch } from "vue";
import CollectSettings from "./settings.vue";
import CollectAction from "./action.vue";
import type { CollectOptions, CollectStatus, CollectDraft } from "../types";

const props = defineProps<{ status: CollectStatus; onCancel: () => boolean }>();
const emit = defineEmits<{ collect: [options: CollectOptions] }>();
const id = `pdd-collect-${crypto.randomUUID()}`;
const form = shallowRef<HTMLFormElement | null>(null);
const action = shallowRef<InstanceType<typeof CollectAction> | null>(null);
const expanded = shallowRef(true);
const draft = reactive<CollectDraft>({
  startDate: "",
  endDate: "",
  includeDetails: true,
  pageSize: 20,
  maxPages: 100,
});
const busy = computed(
  () => props.status === "collecting" || props.status === "cancelling",
);

watch(
  () => props.status,
  async (status) => {
    if (status !== "collecting") return;
    const moveFocus = form.value!.matches(":focus-within");
    expanded.value = false;
    await nextTick();
    if (moveFocus) action.value?.focus({ preventScroll: true });
  },
);

function submit(event: Event) {
  event.preventDefault();
  if (busy.value) return;
  const native = form.value!;
  // FormData 也覆盖浏览器自动填充和未派发 input 的原生值更新。
  const data = new FormData(native);
  Object.assign(draft, {
    startDate: String(data.get("startDate") ?? ""),
    endDate: String(data.get("endDate") ?? ""),
    includeDetails: data.has("includeDetails"),
    pageSize: Number(data.get("pageSize")),
    maxPages: Number(data.get("maxPages")),
  });
  const end = native.elements.namedItem("endDate") as HTMLInputElement;
  end.min = draft.startDate;
  if (!native.reportValidity()) return;
  emit("collect", {
    startDate: readDate(draft.startDate),
    endDate: readDate(draft.endDate),
    includeDetails: draft.includeDetails,
    pageSize: Number(draft.pageSize),
    maxPages: Number(draft.maxPages),
  });
}

function readDate(value: string): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}
</script>

<template>
  <div data-ui="collect-form">
    <form :id="id" ref="form" aria-label="收集设置" @submit="submit">
      <CollectSettings
        :draft="draft"
        :disabled="busy"
        v-model:expanded="expanded"
      />
    </form>
    <CollectAction
      ref="action"
      :form="id"
      :status="status"
      :on-cancel="onCancel"
    />
  </div>
</template>

<style scoped>
[data-ui="collect-form"] {
  display: grid;
  gap: 1em;
}
</style>
