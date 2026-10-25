import { test as base, expect } from "playwright/test";
import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, normalizePath, type ViteDevServer } from "vite";
import { install } from "./fixtures";
import pin from "./tampermonkey.json" with { type: "json" };

interface DevelopmentPage {
  page: Page;
  server: ViteDevServer;
  style: { version: string };
  errors: string[];
}

const test = base.extend<{ development: DevelopmentPage }>({
  development: [
    async ({}, use, testInfo) => {
      const style = { version: "before" };
      const errors: string[] = [];
      const diagnostics: string[] = [];
      const server = await createServer({
        configFile: "vite.config.ts",
        cacheDir: testInfo.outputPath("vite-cache"),
        mode: "test",
        logLevel: "silent",
        plugins: [
          {
            name: "synthetic-development-style",
            enforce: "pre",
            transform(code, id) {
              if (id.endsWith("/src/ui/styles.css?inline")) {
                return (
                  code + `\n:host { --development-test: ${style.version}; }`
                );
              }
            },
          },
        ],
        server: { port: 0, open: false },
      });
      let context: BrowserContext | undefined;
      let setupFailed = false;
      try {
        await test.step("Start Vite", () => server.listen());
        const local = server.resolvedUrls!.local[0]!.replace(/\/$/, "");
        await test.step("Compile development modules", async () => {
          await server.environments.client!.transformRequest("/src/main.ts");
          await server.environments.client!.waitForRequestsIdle();
        });
        const extension = resolve(
          "node_modules/.cache/tampermonkey",
          pin.version,
        );
        context = await chromium.launchPersistentContext("", {
          channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
          locale: "en-US",
          headless: true,
          args: [
            "--disable-extensions-except=" + extension,
            "--load-extension=" + extension,
          ],
        });
        await context.tracing.start({
          screenshots: true,
          snapshots: true,
          sources: true,
        });
        const origin = "https://mobile.pinduoduo.com";
        await context.grantPermissions(["local-network-access"], { origin });
        // 官网使用合成页面；本地 Vite 模块通过真实 HTTP 加载。
        await context.route("**/*", async (route) => {
          const url = new URL(route.request().url());
          if (url.protocol === "chrome-extension:" || url.origin === local) {
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
          await fetch(
            local + "/__vite-plugin-monkey.install.user.js?origin=" + local,
          )
        ).text();
        await mkdir(testInfo.outputDir, { recursive: true });
        const scriptPath = testInfo.outputPath("development.user.js");
        await writeFile(scriptPath, installer);
        const worker =
          context.serviceWorkers()[0] ??
          (await context.waitForEvent("serviceworker"));
        await test.step("Install development userscript", () =>
          install(context!, new URL(worker.url()).host, testInfo, scriptPath));
        const page = await context.newPage();
        page.on("request", (request) => {
          if (request.url().startsWith(local + "/"))
            diagnostics.push("request: " + request.url());
        });
        page.on("requestfailed", (request) => {
          diagnostics.push(
            "failed: " + request.url() + " " + request.failure()?.errorText,
          );
        });
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") diagnostics.push(message.text());
        });
        await test.step("Open synthetic order page", () =>
          page.goto(origin + "/orders.html"));
        await use({ page, server, style, errors });
      } catch (error) {
        setupFailed = true;
        throw error;
      } finally {
        if (setupFailed || testInfo.status !== testInfo.expectedStatus) {
          await testInfo.attach("development-errors", {
            body: [...errors, ...diagnostics].join("\n"),
            contentType: "text/plain",
          });
          if (context) {
            try {
              const trace = testInfo.outputPath("trace.zip");
              await test.step(
                "Save failure trace",
                async () => {
                  await context!.tracing.stop({ path: trace });
                  await testInfo.attach("trace", {
                    path: trace,
                    contentType: "application/zip",
                  });
                },
                { timeout: 10_000 },
              );
            } catch (error) {
              await testInfo.attach("trace-error", {
                body: String(error),
                contentType: "text/plain",
              });
            }
          }
        }
        try {
          await context?.close();
        } finally {
          await server.close();
        }
      }
    },
    // 冷编译和扩展安装使用独立预算；HMR 功能断言保留默认时限。
    { timeout: 120_000 },
  ],
});

test("installed development script supports module and Shadow DOM style hot updates", async ({
  development,
}) => {
  const { page, server, style, errors } = development;
  const panel = page.locator("#pdd-order-export");
  await test.step("Wait for development panel", () =>
    expect(panel.getByRole("button", { name: "导出账单" })).toBeVisible());
  await expect(panel).toHaveCSS("--development-test", "before");
  await panel.evaluate((host) => host.setAttribute("data-original", "true"));
  await page.locator("#site").evaluate((site) => {
    site.textContent = "site state survives hot updates";
  });
  style.version = "after";
  const stylesheet = server.moduleGraph.getModuleById(
    normalizePath(resolve("src/ui/styles.css")) + "?inline",
  );
  expect(stylesheet).toBeTruthy();
  await test.step("Reload stylesheet", async () => {
    const [response] = await Promise.all([
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === "/src/ui/styles.css" && url.searchParams.has("t")
        );
      }),
      server.reloadModule(stylesheet!),
    ]);
    expect(response.ok()).toBe(true);
  });
  await expect(panel).toHaveCSS("--development-test", "after");
  await expect(panel).toHaveAttribute("data-original", "true");
  const component = server.moduleGraph.getModuleById(
    normalizePath(resolve("src/ui/index.tsx")),
  );
  expect(component).toBeTruthy();
  await test.step("Reload component", async () => {
    const [response] = await Promise.all([
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === "/src/ui/index.tsx" && url.searchParams.has("t")
        );
      }),
      server.reloadModule(component!),
    ]);
    expect(response.ok()).toBe(true);
  });
  await expect(panel).not.toHaveAttribute("data-original");
  await expect(panel.getByRole("button", { name: "导出账单" })).toBeVisible();
  await expect(page.locator("#site")).toHaveText(
    "site state survives hot updates",
  );
  expect(errors).toEqual([]);
});
