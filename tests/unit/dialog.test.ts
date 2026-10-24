// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { createElement, render } from "preact";
import { ExportDialog } from "../../src/ui/dialog";

test("dialog owns dismissal and focus without task state, and ignores stale close events", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const onDismiss = vi.fn();
  render(
    createElement(ExportDialog, {
      running: false,
      children: "内容",
      onDismiss,
    }),
    host,
  );
  const dialog = host.querySelector("dialog")!;
  const launcher = host.querySelector<HTMLButtonElement>(".launcher")!;
  // jsdom 不实现原生弹层行为；浏览器测试覆盖真实关闭事件及焦点。
  dialog.showModal = () => {
    dialog.open = true;
  };
  dialog.close = () => {
    dialog.open = false;
    dialog.dispatchEvent(new Event("close"));
  };
  try {
    launcher.click();
    dialog.querySelector("button")!.click();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(launcher);
    expect(launcher.hidden).toBe(false);

    launcher.click();
    dialog.dispatchEvent(new Event("cancel"));
    dialog.close();
    expect(onDismiss).toHaveBeenCalledTimes(2);

    launcher.click();
    dialog.dispatchEvent(new Event("close"));
    expect(dialog.open).toBe(true);
    expect(launcher.hidden).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(2);
    dialog.close();
    expect(onDismiss).toHaveBeenCalledTimes(3);

    launcher.click();
    render(null, host);
    expect(onDismiss).toHaveBeenCalledTimes(3);
  } finally {
    render(null, host);
    host.remove();
  }
});
