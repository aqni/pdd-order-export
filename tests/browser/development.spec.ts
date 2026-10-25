import { test, expect } from "playwright/test";
import { chromium, type BrowserContext } from "playwright";
import type { AddressInfo } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, normalizePath } from "vite";
import { install } from "./fixtures";
import pin from "./tampermonkey.json" with { type: "json" };

test("installed development script supports module and Shadow DOM style hot updates", async ({}, testInfo) => {
  test.setTimeout(90_000);
  let styleVersion = "before";
  const errors: string[] = [];
  const diagnostics: string[] = [];
  const server = await createServer({
    configFile: "vite.config.ts",
    mode: "test",
    logLevel: "silent",
    plugins: [
      {
        name: "synthetic-development-style",
        enforce: "pre",
        transform(code, id) {
          if (id.endsWith("/src/ui/styles.css?inline")) {
            return code + `\n:host { --development-test: ${styleVersion}; }`;
          }
        },
      },
    ],
    server: { port: 0, open: false },
  });
  let context: BrowserContext | undefined;
  try {
    await server.listen();
    const base =
      "http://127.0.0.1:" + (server.httpServer!.address() as AddressInfo).port;
    const extension = resolve("node_modules/.cache/tampermonkey", pin.version);
    context = await chromium.launchPersistentContext("", {
      channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
      headless: true,
      args: [
        "--disable-extensions-except=" + extension,
        "--load-extension=" + extension,
      ],
    });
    const origin = "https://mobile.pinduoduo.com";
    await context.grantPermissions(["local-network-access"], { origin });
    // 官网使用合成页面；本地 Vite 模块通过真实 HTTP 加载，不访问账号或站点接口。
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === "chrome-extension:" || url.origin === base) {
        return route.continue();
      }
      if (url.href === origin + "/orders.html") {
        return route.fulfill({
          contentType: "text/html",
          body: "<html><body><p id='site'>synthetic PDD page</p></body></html>",
        });
      }
      return route.abort();
    });
    const installer = await (
      await fetch(base + "/__vite-plugin-monkey.install.user.js?origin=" + base)
    ).text();
    await mkdir(testInfo.outputDir, { recursive: true });
    const scriptPath = testInfo.outputPath("development.user.js");
    await writeFile(scriptPath, installer);
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await install(context, new URL(worker.url()).host, scriptPath);

    const page = await context.newPage();
    page.on("request", (request) => {
      if (request.url().startsWith(base + "/")) {
        diagnostics.push("request: " + request.url());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.push(message.text());
    });
    await page.goto(origin + "/orders.html");
    const panel = page.locator("#pdd-order-export");
    await expect(panel.getByRole("button", { name: "导出账单" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(panel).toHaveCSS("--development-test", "before");
    await panel.evaluate((host) => host.setAttribute("data-original", "true"));
    await page.locator("#site").evaluate((site) => {
      site.textContent = "site state survives hot updates";
    });

    styleVersion = "after";
    const style = server.moduleGraph.getModuleById(
      normalizePath(resolve("src/ui/styles.css")) + "?inline",
    );
    expect(style).toBeTruthy();
    await server.reloadModule(style!);
    await expect(panel).toHaveCSS("--development-test", "after");
    await expect(panel).toHaveAttribute("data-original", "true");

    const component = server.moduleGraph.getModuleById(
      normalizePath(resolve("src/ui/index.tsx")),
    );
    expect(component).toBeTruthy();
    await server.reloadModule(component!);
    await expect(panel).not.toHaveAttribute("data-original");
    await expect(panel.getByRole("button", { name: "导出账单" })).toBeVisible();
    await expect(page.locator("#site")).toHaveText(
      "site state survives hot updates",
    );
    expect(errors).toEqual([]);
  } catch (error) {
    await testInfo.attach("development-errors", {
      body: [...errors, ...diagnostics].join("\n"),
      contentType: "text/plain",
    });
    throw error;
  } finally {
    await context?.close();
    await server.close();
  }
});
