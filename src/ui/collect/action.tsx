import { createElement, type RefObject } from "preact";

/** 使用原生表单提交；停止时阻止默认提交，并请求宿主取消任务。 */
export function CollectAction(props: CollectActionProps) {
  const { form, buttonRef, running, cancelling, hasResult, onCancel } = props;
  return (
    <button
      class="action"
      form={form}
      ref={buttonRef}
      title={!running && hasResult ? "重新收集会替换当前结果。" : ""}
      type={running ? "button" : "submit"}
      disabled={cancelling}
      onClick={(event) => {
        // 渲染尚未更新为停止按钮时，也能立即取消刚启动的任务。
        if (onCancel()) event.preventDefault();
      }}
    >
      {describeAction(props)}
    </button>
  );
}

interface CollectActionProps {
  form: string;
  buttonRef: RefObject<HTMLButtonElement>;
  running: boolean;
  cancelling: boolean;
  hasResult: boolean;
  onCancel: () => boolean;
}

function describeAction({
  running,
  cancelling,
  hasResult,
}: CollectActionProps): string {
  if (cancelling) return "正在停止…";
  if (running) return "停止并保留结果";
  return hasResult ? "重新收集" : "开始收集";
}
