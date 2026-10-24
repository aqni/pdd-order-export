import type { ShallowRef } from "vue";
import type { CollectStatus } from "./form";

const labels: Record<CollectStatus, string> = {
  idle: "开始收集",
  collecting: "停止并保留结果",
  cancelling: "正在停止…",
  complete: "重新收集",
};

export function CollectAction({
  form,
  buttonRef,
  status,
  onCancel,
}: {
  form: string;
  buttonRef: ShallowRef<HTMLButtonElement | null>;
  status: CollectStatus;
  onCancel: () => boolean;
}) {
  return (
    <div data-ui="collect-action">
      <button
        class="action"
        form={form}
        ref={buttonRef}
        type={
          status === "collecting" || status === "cancelling"
            ? "button"
            : "submit"
        }
        disabled={status === "cancelling"}
        title={status === "complete" ? "重新收集会替换当前结果。" : ""}
        onClick={(event) => {
          if (onCancel()) event.preventDefault();
        }}
      >
        {labels[status]}
      </button>
    </div>
  );
}
