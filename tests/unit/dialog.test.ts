// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { h, render } from "preact";
import { ExportDialog } from "../../src/ui/dialog";

test("dialog declares native commands and closes when unmounted", () => {
  const host = document.createElement("div");
  document.body.append(host);
  render(h(ExportDialog, { children: "内容" }), host);
  const dialog = host.querySelector("dialog")!;
  const close = vi.fn();
  dialog.close = close;
  try {
    const launcher = host.querySelector<HTMLButtonElement>(
      '[command="show-modal"]',
    )!;
    expect(launcher.getAttribute("commandfor")).toBe(dialog.id);
    expect(dialog.getAttribute("aria-labelledby")).toBe(
      host.querySelector("h2")!.id,
    );
    expect(dialog.querySelector("form")!.method).toBe("dialog");
    expect(dialog.querySelector("button")!.type).toBe("submit");
    render(null, host);
    expect(close).toHaveBeenCalledOnce();
  } finally {
    render(null, host);
    host.remove();
  }
});
