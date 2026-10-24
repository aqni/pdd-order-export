import {
  Component,
  Fragment,
  createRef,
  createElement,
  type ComponentChildren,
} from "preact";

/** 管理原生弹层及触发按钮；每次关闭只通知一次宿主。 */
export class ExportDialog extends Component<ExportDialogProps> {
  readonly #dialog = createRef<HTMLDialogElement>();
  readonly #launcher = createRef<HTMLButtonElement>();
  readonly #titleId = `pdd-panel-${crypto.randomUUID()}`;
  #dismissed = false;
  #disposed = false;

  render({ running, children }: ExportDialogProps) {
    return (
      <>
        <button
          class="launcher"
          type="button"
          ref={this.#launcher}
          onClick={this.#open}
        >
          导出账单
        </button>
        <dialog
          ref={this.#dialog}
          aria-labelledby={this.#titleId}
          onClose={this.#onClose}
          onCancel={this.#dismiss}
        >
          <header>
            <h2 id={this.#titleId}>订单导出</h2>
            <button type="button" onClick={this.#close}>
              {running ? "停止并关闭" : "关闭"}
            </button>
          </header>
          {children}
        </dialog>
      </>
    );
  }

  componentWillUnmount(): void {
    this.#disposed = true;
    this.#dialog.current?.close();
  }

  #open = () => {
    this.#dismissed = false;
    this.#dialog.current!.showModal();
    this.#launcher.current!.hidden = true;
  };

  #close = () => {
    this.#dismiss();
    this.#dialog.current!.close();
  };

  #dismiss = () => {
    if (this.#disposed || this.#dismissed) return;
    this.#dismissed = true;
    this.props.onDismiss();
  };

  #onClose = () => {
    // 延迟到达的 close 事件不应影响已经重新打开的弹层。
    if (this.#disposed || this.#dialog.current?.open) return;
    this.#dismiss();
    this.#launcher.current!.hidden = false;
    this.#launcher.current!.focus({ preventScroll: true });
  };
}

interface ExportDialogProps {
  running: boolean;
  children: ComponentChildren;
  onDismiss: () => void;
}
