import { Component, h, createRef, type ComponentChildren } from "preact";

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
          <header>
            <h2 id={`${this.#id}-title`}>订单导出</h2>
            <form method="dialog">
              <button type="submit">收起</button>
            </form>
          </header>
          {children}
        </dialog>
        <button
          class="launcher"
          type="button"
          command="show-modal"
          commandfor={this.#id}
        >
          导出账单
        </button>
      </div>
    );
  }

  componentWillUnmount() {
    this.#dialog.current?.close();
  }
}
