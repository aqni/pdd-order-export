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
      "ui/index.tsx",
      "ui/collect/form.tsx",
      "ui/collect/controls.tsx",
      "ui/collect/action.tsx",
      "ui/collect/date-range.tsx",
      "ui/collect/request-settings.tsx",
      "ui/collect/details-option.tsx",
      "ui/collect/progress.tsx",
      "ui/export/controls.tsx",
      "ui/export/actions.tsx",
      "ui/collect/date-field.tsx",
      "ui/dialog.tsx",
      "main.ts",
    ]) {
      const response = await fetch(base + `/src/${component}`);
      expect(response.ok).toBe(true);
    }
  } finally {
    await server.close();
  }
}, 30000);
