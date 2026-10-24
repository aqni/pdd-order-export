import { test, expect } from "vitest";
import { createServer } from "vite";
import type { AddressInfo } from "node:net";

test("the real development server serves an installable script and compiled validators", async () => {
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
    for (const component of ["view", "main"]) {
      const response = await fetch(base + `/src/${component}.ts`);
      expect(response.ok).toBe(true);
    }
  } finally {
    await server.close();
  }
}, 30000);
