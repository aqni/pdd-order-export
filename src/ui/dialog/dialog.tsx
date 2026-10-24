import { defineComponent, onBeforeUnmount, shallowRef } from "vue";
import { ExportPositioner } from "./positioner";

/** 打开、关闭、焦点与遮罩交给原生模态窗口；收起不卸载插槽内容。 */
export const ExportDialog = defineComponent((_props, { slots }) => {
  const id = `pdd-dialog-${crypto.randomUUID()}`;
  const dialog = shallowRef<HTMLDialogElement | null>(null);
  onBeforeUnmount(() => dialog.value?.close());

  return () => (
    <div data-ui="dialog">
      <dialog id={id} ref={dialog} aria-labelledby={`${id}-title`}>
        <div class="layout">
          <header>
            <h2 id={`${id}-title`}>订单导出</h2>
            <form method="dialog">
              <button type="submit">收起</button>
            </form>
          </header>
          <div>{slots.default?.()}</div>
        </div>
      </dialog>
      <div class="launcher">
        <ExportPositioner>
          <button
            type="button"
            command="show-modal"
            commandfor={id}
            title="点击打开，拖动调整位置"
          >
            导出账单
          </button>
        </ExportPositioner>
      </div>
    </div>
  );
});
