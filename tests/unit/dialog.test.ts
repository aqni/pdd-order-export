// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { ExportDialog } from "../../src/ui/dialog";

test("dialog binds its native invoker across Shadow Roots and closes on disposal", async () => {
  const element = new ExportDialog();
  element.textContent = "内容";
  document.body.append(element);
  await element.updateComplete;
  const host = element.shadowRoot!;
  const dialog = host.querySelector("dialog")!;
  const launcher = host.querySelector("pdd-export-launcher")!;
  await launcher.updateComplete;
  const launchButton = launcher.shadowRoot!.querySelector("button")!;
  // jsdom 不实现命令按钮和模态行为；真实点击、Esc、焦点由浏览器测试覆盖。
  dialog.close = vi.fn(() => {
    dialog.open = false;
  });
  try {
    expect(launchButton.getAttribute("command")).toBe("show-modal");
    expect(launchButton.commandForElement).toBe(dialog);
    dialog.open = true;
    element.remove();
    document.body.append(element);
    await Promise.resolve();
    expect(dialog.close).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);
    element.dispose();
    expect(dialog.close).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(false);
    host.replaceChildren();
  } finally {
    element.dispose();
    host.replaceChildren();
    element.remove();
  }
});
