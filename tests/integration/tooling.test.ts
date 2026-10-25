import { afterEach, test, expect, vi } from "vitest";
import { createServer } from "vite";
import { glob } from "node:fs/promises";

afterEach(() => vi.unstubAllEnvs());

test("the development server serves an installer and compiled modules without a site proxy", async () => {
  vi.stubEnv("BROWSER", "none");
  const server = await createServer({
    configFile: "vite.config.ts",
    mode: "test",
    logLevel: "silent",
    server: { port: 0, open: false },
  });
  try {
    await server.listen();
    const base = server.resolvedUrls!.local[0]!.replace(/\/$/, "");
    expect(Object.keys(server.config.server.proxy ?? {})).toEqual([]);
    const installer = await (
      await fetch(base + "/__vite-plugin-monkey.install.user.js")
    ).text();
    expect(installer).toMatch(/@name\s+server:/);
    expect(installer).toContain("https://mobile.pinduoduo.com/orders.html*");
    expect(installer).not.toMatch(
      /@match\s+http:\/\/(?:localhost|127\.0\.0\.1)/,
    );
    expect(await (await fetch(base + "/")).text()).toContain(
      "__vite-plugin-monkey.install.user.js",
    );
    expect(await (await fetch(base + "/@vite/client")).text()).toContain(
      "WebSocket",
    );
    expect(
      await (await fetch(base + "/__vite-plugin-monkey.entry.js")).text(),
    ).toContain("src/main.ts");
    const module = await (await fetch(base + "/src/pdd.ts")).text();
    expect(module).toContain("getOrderDetail");
    expect(module).not.toMatch(/\bassert<|\bassert\s*\(/);
    for await (const component of glob(["src/ui/**/*.tsx", "src/main.ts"])) {
      const response = await fetch(
        base + "/" + component.replaceAll("\\", "/"),
      );
      expect(response.ok).toBe(true);
    }
  } finally {
    await server.close();
  }
}, 30000);
