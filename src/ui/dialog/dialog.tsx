import { Component, h, createRef, type ComponentChildren } from "preact";
import { ExportPositioner } from "./positioner";

/** 打开、关闭、焦点与遮罩都交给原生模态窗口；收起不影响收集任务。 */
export class ExportDialog extends Component<{ children: ComponentChildren }> {
  readonly #id = `pdd-dialog-${crypto.randomUUID()}`;
  readonly #dialog = createRef<HTMLDialogElement>();

  render({ children }: { children: ComponentChildren }) {
    return (
      <div data-ui="dialog">
        <dialog
          id={this.#id}
          ref={this.#dialog}
          aria-labelledby={`${this.#id}-title`}
        >
          <div class="layout">
            <header>
              <h2 id={`${this.#id}-title`}>订单导出</h2>
              <form method="dialog">
                <button type="submit">收起</button>
              </form>
            </header>
            <div>{children}</div>
          </div>
        </dialog>
        <div class="launcher">
          <ExportPositioner>
            <button
              type="button"
              command="show-modal"
              commandfor={this.#id}
              title="点击打开，拖动调整位置"
            >
              导出账单
            </button>
          </ExportPositioner>
        </div>
      </div>
    );
  }

  componentWillUnmount() {
    this.#dialog.current?.close();
  }
}
