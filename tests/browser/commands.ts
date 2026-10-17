import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defineBrowserCommand } from '@vitest/browser-playwright';
import type { BrowserContext, Download, Route } from 'playwright';
import { detail, orders, uid } from './shop-data.ts';
import type { DownloadedFile, Scenario, ShopSnapshot } from './shop-data.ts';

interface ShopRuntime {
  requests: ShopSnapshot['requests'];
  files: Download[];
  errors: string[];
  releaseDetail: () => void;
  cleanup: () => Promise<void>;
}

// Provider contexts are isolated by test file; each test also resets its fixture.
const shops = new WeakMap<BrowserContext, ShopRuntime>();

export const shopCommands = {
  startShop: defineBrowserCommand<[Scenario]>(async (ctx, scenario) => {
    assert(!shops.has(ctx.context), 'Previous shop fixture was not cleaned up');
    const script = await readFile('dist/pdd-order-export.user.js', 'utf8');
    const frame = await ctx.frame();
    const origin = new URL(frame.url()).origin;
    let listCount = 0;
    let releaseDetail: () => void = () => {};
    const detailGate = new Promise<void>((resolve) => {
      releaseDetail = resolve;
    });
    const files: Download[] = [];
    const errors: string[] = [];
    const requests: ShopSnapshot['requests'] = [];
    const onDownload = (file: Download) => {
      files.push(file);
    };
    const onError = (error: Error) => {
      errors.push(error.message);
    };
    const handler = async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      try {
        assert.equal(url.origin, origin, 'External requests are forbidden');
        if (url.pathname === '/__synthetic/userscript.js') {
          await route.fulfill({
            contentType: 'application/javascript',
            body: script,
          });
        } else if (url.pathname === '/proxy/api/api/aristotle/order_list_v4') {
          const body = request.postDataJSON();
          requests.push({
            path: url.pathname,
            method: request.method(),
            body,
          });
          assert.equal(request.method(), 'POST');
          assert.equal(url.searchParams.get('pdduid'), uid);
          assert.deepEqual([...url.searchParams.keys()], ['pdduid']);
          assert.equal(request.headers()['content-type'], 'application/json');
          assert(request.headers()['cookie']?.includes(`pdd_user_id=${uid}`));
          assert(listCount < 2, 'Unexpected extra list request');
          assert.deepEqual(
            body,
            listCount === 0
              ? { size: 10 }
              : { size: 10, offset: orders[0]!.offset },
          );
          listCount++;
          await route.fulfill({
            json: { orders: listCount === 1 ? orders : [] },
          });
        } else if (url.pathname === '/order.html') {
          requests.push({
            path: url.pathname,
            method: request.method(),
            body: null,
          });
          assert.equal(request.method(), 'GET');
          const orderId = url.searchParams.get('order_sn');
          assert.equal(orderId, orders[0]!.order_sn);
          assert.deepEqual([...url.searchParams.keys()], ['order_sn']);
          if (scenario === 'cancel') {
            await detailGate;
          }
          await route.fulfill({
            contentType: 'text/html',
            body: `<script>window.rawData = ${JSON.stringify({ data: detail })};</script>`,
          });
        } else if (
          /^\/(?:@|__vitest|node_modules\/|tests\/)/.test(url.pathname) &&
          request.method() === 'GET'
        ) {
          // Preserve Vitest's test module imports and runner RPC.
          await route.fallback();
        } else {
          throw new Error(
            `Unexpected application request: ${request.method()} ${url.pathname}`,
          );
        }
      } catch (error) {
        errors.push(String(error));
        await route.abort('blockedbyclient');
      }
    };
    await ctx.context.clearCookies({ name: 'pdd_user_id' });
    await ctx.context.addCookies([
      { name: 'pdd_user_id', value: uid, url: origin },
    ]);
    ctx.page.on('download', onDownload);
    ctx.page.on('pageerror', onError);
    await ctx.context.route('**/*', handler);
    shops.set(ctx.context, {
      requests,
      files,
      errors,
      releaseDetail,
      async cleanup() {
        releaseDetail();
        await ctx.context.unroute('**/*', handler);
        await Promise.all(files.map((file) => file.delete()));
        await ctx.context.clearCookies({ name: 'pdd_user_id' });
        ctx.page.off('download', onDownload);
        ctx.page.off('pageerror', onError);
      },
    });
  }),
  shopState: defineBrowserCommand(async (ctx): Promise<ShopSnapshot> => {
    const shop = shops.get(ctx.context);
    assert(shop, 'Shop fixture is not active');
    return {
      requests: shop.requests,
      downloads: shop.files.length,
      errors: shop.errors,
    };
  }),
  releaseShopDetail: defineBrowserCommand(async (ctx) => {
    shops.get(ctx.context)?.releaseDetail();
  }),
  readShopDownload: defineBrowserCommand<[number]>(
    async (ctx, index): Promise<DownloadedFile> => {
      const file = shops.get(ctx.context)?.files[index];
      assert(file, `Missing download ${index}`);
      assert.equal(await file.failure(), null);
      const path = await file.path();
      assert(path, 'Browser download did not produce a file');
      const bytes = await readFile(path);
      return {
        name: file.suggestedFilename(),
        bytes: [...bytes],
        text: bytes.toString('utf8'),
      };
    },
  ),
  stopShop: defineBrowserCommand(async (ctx) => {
    const shop = shops.get(ctx.context);
    if (shop) {
      try {
        await shop.cleanup();
      } finally {
        shops.delete(ctx.context);
      }
    }
  }),
};

declare module 'vitest/browser' {
  interface BrowserCommands {
    startShop: (scenario: Scenario) => Promise<void>;
    shopState: () => Promise<ShopSnapshot>;
    releaseShopDetail: () => Promise<void>;
    readShopDownload: (index: number) => Promise<DownloadedFile>;
    stopShop: () => Promise<void>;
  }
}
