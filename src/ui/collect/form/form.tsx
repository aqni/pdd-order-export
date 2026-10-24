import {
  computed,
  defineComponent,
  nextTick,
  reactive,
  shallowRef,
  watch,
} from "vue";
import type { collectOrders } from "../../../collect";
import { CollectSettings, type CollectDraft } from "./settings";
import { CollectAction } from "./action";

export type CollectOptions = Parameters<typeof collectOrders>[1];
export type CollectStatus = "idle" | "collecting" | "cancelling" | "complete";
interface Props {
  status: CollectStatus;
  onCollect: (options: CollectOptions) => void;
  onCancel: () => boolean;
}

/** 草稿集中在表单；原生校验和焦点保留在 DOM，提交时生成独立快照。 */
export const CollectForm = defineComponent(
  (props: Props) => {
    const id = `pdd-collect-${crypto.randomUUID()}`;
    const form = shallowRef<HTMLFormElement | null>(null);
    const action = shallowRef<HTMLButtonElement | null>(null);
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
      props.onCollect({
        startDate: readDate(draft.startDate),
        endDate: readDate(draft.endDate),
        includeDetails: draft.includeDetails,
        pageSize: Number(draft.pageSize),
        maxPages: Number(draft.maxPages),
      });
    }

    return () => (
      <div data-ui="collect-form">
        <form id={id} ref={form} aria-label="收集设置" onSubmit={submit}>
          <CollectSettings
            draft={draft}
            disabled={busy.value}
            expanded={expanded.value}
            onExpandedChange={(value) => {
              expanded.value = value;
            }}
          />
        </form>
        <CollectAction
          form={id}
          buttonRef={action}
          status={props.status}
          onCancel={props.onCancel}
        />
      </div>
    );
  },
  { props: ["status", "onCollect", "onCancel"] },
);

function readDate(value: string): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}
