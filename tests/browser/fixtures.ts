import { test as base, expect, type TestInfo } from "playwright/test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import {
  chromium,
  type BrowserContext,
  type Download,
  type Page,
} from "playwright";
import pin from "./tampermonkey.json" with { type: "json" };
import { createShop } from "./shop";

export { expect };
export const test = base.extend<{ shop: Awaited<ReturnType<typeof openShop>> }>(
  {
    shop: async ({}, use, testInfo) => {
      const shop = await openShop(testInfo);
      try {
        await use(shop);
        expect(shop.fixture.errors).toEqual([]);
      } finally {
        const failed =
          testInfo.status !== testInfo.expectedStatus ||
          shop.fixture.errors.length > 0;
        await shop.close(failed);
      }
    },
  },
);

const require = createRequire(import.meta.url);
const origin = "https://mobile.pinduoduo.com";

async function install(context: BrowserContext, extensionId: string) {
  const installer = await context.newPage();
  await installer.goto("chrome://extensions/?id=" + extensionId);
  await installer.evaluate(async (id) => {
    const browser = globalThis as unknown as {
      chrome: {
        developerPrivate: {
          updateExtensionConfiguration(options: {
            extensionId: string;
            userScriptsAccess: boolean;
          }): Promise<void>;
        };
      };
    };
    await browser.chrome.developerPrivate.updateExtensionConfiguration({
      extensionId: id,
      userScriptsAccess: true,
    });
  }, extensionId);
  await installer.goto("chrome-extension://" + extensionId + "/options.html");
  // 首次启动可能早于权限开启；等扩展注册注入脚本，避免错过首个文档。
  await expect
    .poll(
      () =>
        installer.evaluate(async () => {
          const browser = globalThis as unknown as {
            chrome: {
              userScripts: {
                getScripts(): Promise<{ js?: { file?: string }[] }[]>;
              };
            };
          };
          const scripts = await browser.chrome.userScripts.getScripts();
          return scripts.flatMap((script) =>
            (script.js ?? []).map((source) => source.file),
          );
        }),
      { message: "Tampermonkey injection scripts must be registered" },
    )
    .toEqual(expect.arrayContaining(["page.js", "content.js"]));
  await installer.getByText(/^(Utilities|实用工具)$/).click();
  const [confirmation] = await Promise.all([
    context.waitForEvent("page", {
      predicate: (page) => page.url().includes("/ask.html"),
    }),
    installer
      .locator("input[type=file]")
      .setInputFiles("dist/pdd-order-export.user.js"),
  ]);
  await Promise.all([
    confirmation.waitForEvent("close"),
    confirmation.getByRole("button", { name: /^(Install|安装)$/ }).click(),
  ]);
  await installer.close();
}

/** Actual Tampermonkey install in a disposable profile, with every network path intercepted or denied. */
async function openShop(testInfo: TestInfo) {
  const shop = createShop();
  const { fixture, release } = shop;
  const loaded = new Set<string>();
  const downloads: Download[] = [];
  const dependencies = new Map<string, string>();
  for (const [name, file] of [
    ["papaparse", "papaparse.min.js"],
    ["acorn", "dist/acorn.js"],
    ["wretch", "dist/bundle/wretch.min.js"],
    ["preact", "dist/preact.umd.js"],
  ]) {
    const packagePath = require.resolve(name + "/package.json");
    const { version } = require(packagePath);
    dependencies.set(
      "https://cdn.jsdelivr.net/npm/" + name + "@" + version + "/" + file,
      await readFile(join(dirname(packagePath), file!), "utf8"),
    );
  }
  const extension = resolve("node_modules/.cache/tampermonkey", pin.version);
  assert.equal(
    JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"))
      .version,
    pin.version,
  );
  const proxy = createServer((_request, response) =>
    response.writeHead(502).end(),
  );
  proxy.on("connect", (_request, socket) => {
    socket.on("error", () => {});
    socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
  });
  await new Promise<void>((done) => proxy.listen(0, "127.0.0.1", done));
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  async function close(failed = false) {
    release();
    try {
      if (failed && context) {
        await mkdir(testInfo.outputDir, { recursive: true });
        const screenshotPage =
          page ?? context.pages().find((page) => !page.isClosed());
        const captures = await Promise.allSettled([
          context.tracing
            .stop({ path: testInfo.outputPath("trace.zip") })
            .then(() =>
              testInfo.attach("trace", {
                path: testInfo.outputPath("trace.zip"),
                contentType: "application/zip",
              }),
            ),
          screenshotPage
            ?.screenshot({ path: testInfo.outputPath("page.png") })
            .then(() =>
              testInfo.attach("page", {
                path: testInfo.outputPath("page.png"),
                contentType: "image/png",
              }),
            ),
        ]);
        for (const capture of captures) {
          if (capture.status === "rejected") {
            console.error(
              "Could not save browser diagnostics:",
              capture.reason,
            );
          }
        }
      }
    } finally {
      try {
        await context?.close();
      } finally {
        await new Promise<void>((done) => proxy.close(() => done()));
      }
    }
  }

  try {
    context = await chromium.launchPersistentContext("", {
      channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
      headless: true,
      hasTouch: true,
      viewport: { width: 1000, height: 800 },
      proxy: {
        server: "http://127.0.0.1:" + (proxy.address() as AddressInfo).port,
      },
      args: [
        "--disable-extensions-except=" + extension,
        "--load-extension=" + extension,
      ],
    });
    context.setDefaultTimeout(10000);
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.protocol === "chrome-extension:") {
        return route.continue();
      }
      const dependency = dependencies.get(url.href);
      if (dependency !== undefined) {
        loaded.add(url.href);
        return route.fulfill({
          contentType: "application/javascript",
          body: dependency,
        });
      }
      if (url.origin !== origin) {
        try {
          if (page && request.frame().page() === page) {
            fixture.errors.push("Unexpected external request: " + url.origin);
          }
        } catch {
          /* Extension background request. */
        }
        return route.abort();
      }
      try {
        await shop.handle(route);
      } catch (error) {
        fixture.errors.push(String(error));
        await route.abort();
      }
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await install(context, new URL(worker.url()).host);
    await context.addCookies([
      { name: "pdd_user_id", value: shop.uid, url: origin },
    ]);
    page = await context.newPage();
    page.on("download", (file) => downloads.push(file));
    page.on("pageerror", (error) => fixture.errors.push(error.message));
    await page.goto(origin + "/orders.html");
    await page.getByRole("button", { name: "导出账单", exact: true }).click();
    assert.deepEqual([...loaded].sort(), [...dependencies.keys()].sort());
    return {
      fixture,
      page,
      context,
      downloads,
      release,
      close,
      dialog: page.getByRole("dialog", {
        name: "订单导出",
        includeHidden: true,
      }),
      async file(download: Download) {
        assert.equal(await download.failure(), null);
        const path = await download.path();
        assert(path);
        return {
          name: download.suggestedFilename(),
          bytes: await readFile(path),
        };
      },
    };
  } catch (error) {
    await close(true);
    throw error;
  }
}
