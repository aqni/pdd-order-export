import { formTag, type ExportFormElement } from "./form";
import { resultTag, type ExportResultElement } from "./result";
import type { TaskState } from "./model";
import baseStyle from "./styles.css?style";
import componentStyle from "./panel.css?style";

/** The shell owns dialog visibility and composes independent Web Components. */
export function createPanelView(root: ShadowRoot) {
  const template = document.createElement("template");
  template.innerHTML = `
    <div class="shell">
      <button
        class="launcher"
        data-action="open"
        type="button"
        aria-haspopup="dialog"
      >
        导出账单
      </button>
      <dialog aria-labelledby="export-title">
        <header>
          <h1 id="export-title">订单导出</h1>
          <button
            class="close"
            data-action="close"
            type="button"
            aria-label="关闭"
          >
            关闭
          </button>
        </header>
        <pdd-export-form></pdd-export-form>
        <pdd-export-result></pdd-export-result>
        <details class="note">
          <summary>使用说明</summary>
          <p>文件在本机生成。关闭面板后任务继续；请勿刷新或关闭页面。</p>
          <p>原始 JSON 可能含个人信息，请妥善保管。</p>
        </details>
      </dialog>
    </div>
  `;
  root.append(
    baseStyle.cloneNode(true),
    componentStyle.cloneNode(true),
    template.content,
  );
  const form = root.querySelector<ExportFormElement>(formTag)!;
  const result = root.querySelector<ExportResultElement>(resultTag)!;
  const dialog = root.querySelector("dialog")!;
  const launcher = root.querySelector<HTMLButtonElement>(".launcher")!;
  launcher.addEventListener("click", () => {
    if (!dialog.open) {
      dialog.showModal();
    }
  });
  root
    .querySelector<HTMLButtonElement>(".close")!
    .addEventListener("click", () => dialog.close());
  return {
    form,
    result,
    close() {
      if (dialog.open) {
        dialog.close();
      }
    },
    update(state: TaskState) {
      launcher.textContent = state.running ? "订单收集中…" : "导出账单";
      form.running = state.running;
      result.state = state;
    },
  };
}
