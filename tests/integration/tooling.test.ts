import { afterEach, test, expect, vi } from "vitest";
import { createServer } from "vite";
import type { AddressInfo } from "node:net";

afterEach(() => vi.unstubAllEnvs());

test("the real development server serves an installable script and compiled validators", async () => {
  vi.stubEnv("BROWSER", "none");
  const server = await createServer({
    configFile: "vite.config.ts",
    mode: "test",
    logLevel: "silent",
    server: { port: 0, open: false },
  });
  try {
    await server.listen();
    const base =
      "http://127.0.0.1:" + (server.httpServer!.address() as AddressInfo).port;
    const installer = await (
      await fetch(base + "/__vite-plugin-monkey.install.user.js")
    ).text();
    expect(installer).toMatch(/@name\s+server:/);
    expect(installer).toContain("https://mobile.pinduoduo.com/orders.html*");
    const module = await (await fetch(base + "/src/pdd.ts")).text();
    expect(module).toContain("getOrderDetail");
    expect(module).not.toMatch(/\bassert<|\bassert\s*\(/);
    for (const component of [
      "ui/index.ts",
      "ui/panel.ts",
      "ui/collect/index.ts",
      "ui/collect/controls.ts",
      "ui/collect/form/index.ts",
      "ui/collect/form/form.ts",
      "ui/collect/form/settings.ts",
      "ui/collect/form/date-range.ts",
      "ui/collect/form/details-option.ts",
      "ui/collect/form/request-settings.ts",
      "ui/collect/form/action.ts",
      "ui/collect/feedback.ts",
      "ui/collect/progress.ts",
      "ui/export/index.ts",
      "ui/export/controls.ts",
      "ui/export/result.ts",
      "ui/export/download.ts",
      "ui/dialog/index.ts",
      "ui/dialog/dialog.ts",
      "ui/dialog/launcher.ts",
      "ui/dialog/positioner.ts",
      "main.ts",
    ]) {
      const response = await fetch(base + `/src/${component}`);
      expect(response.ok).toBe(true);
    }
    const updates = vi.spyOn(server.environments.client!.hot, "send");
    const component = await server.moduleGraph.getModuleByUrl(
      "/src/ui/collect/form/date-range.ts",
    );
    await server.reloadModule(component!);
    expect(updates).toHaveBeenCalledWith(
      expect.objectContaining({ type: "full-reload" }),
    );
  } finally {
    await server.close();
  }
}, 30000);
