import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import type { AddressInfo } from 'node:net';

let server: ViteDevServer | undefined;
let origin: string;

beforeAll(async () => {
  server = await createServer({
    configFile: 'vite.config.ts',
    mode: 'test',
    logLevel: 'silent',
    server: { port: 0, open: false },
  });
  await server.listen();
  origin = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
}, 15000);

afterAll(async () => {
  await server?.close();
});

it('serves the native development installer and transformed entry', async () => {
  const response = await fetch(
    `${origin}/__vite-plugin-monkey.install.user.js`,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('javascript');
  const installer = await response.text();
  expect(installer).toMatch(/^\/\/ @name\s+server:/m);
  expect(installer).toMatch(/^\/\/ @run-at\s+document-end$/m);
  expect(installer.match(/^\/\/ @match\s+(.+)$/gm)).toEqual([
    '// @match        https://mobile.pinduoduo.com/orders.html*',
  ]);
  expect(installer).toContain(`${origin}/__vite-plugin-monkey.entry.js`);

  const entry = await fetch(`${origin}/__vite-plugin-monkey.entry.js`);
  expect(entry.status).toBe(200);
  expect(await entry.text()).toContain('import "/src/main.ts"');
  const main = await fetch(`${origin}/src/main.ts`);
  expect(main.status).toBe(200);
  expect(await main.text()).toContain('mountPanel');
});

it('transforms isolated styles through the actual monkey plugin', async () => {
  const response = await fetch(`${origin}/src/ui/form.css?style`);
  expect(response.status).toBe(200);
  const styleModule = await response.text();
  expect(styleModule).toContain('export default style');
  expect(styleModule).toContain('cloneNode');
  expect(styleModule).toContain('import.meta.hot');
});
