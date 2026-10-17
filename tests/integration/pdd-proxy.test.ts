import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import config from '../../vite.proxy.config';

let upstream: http.Server;
let proxy: ViteDevServer;
let origin: string;
let upstreamOrigin: string;
let received:
  | {
      url?: string;
      method?: string;
      headers: http.IncomingHttpHeaders;
      body: string;
    }
  | undefined;

beforeEach(async () => {
  received = undefined;
  upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = {
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: Buffer.concat(chunks).toString(),
    };
    if (req.url === '/failure') {
      req.socket.destroy();
    } else if (req.url === '/redirect') {
      res
        .writeHead(302, {
          location: `${upstreamOrigin}/login.html`,
          'set-cookie': [
            'synthetic=1; Domain=.example.test; Path=/; Secure; HttpOnly; SameSite=None',
            'other=2; Path=/; HttpOnly',
          ],
        })
        .end();
    } else if (req.url === '/compressed') {
      const body = gzipSync(
        '<a href="https://mobile.pinduoduo.com/orders.html">synthetic</a>',
      );
      res
        .writeHead(200, {
          'content-type': 'text/html',
          'content-encoding': 'gzip',
          'content-length': body.length,
          'content-security-policy': "default-src 'self'",
        })
        .end(body);
    } else if (req.url === '/binary') {
      res
        .writeHead(200, { 'content-type': 'application/octet-stream' })
        .end(Buffer.from([0, 255, 128, 1]));
    } else {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end('{"synthetic":true}');
    }
  });
  await new Promise<void>((resolve) =>
    upstream.listen(0, '127.0.0.1', resolve),
  );
  upstreamOrigin = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  proxy = await createServer({
    ...config,
    configFile: false,
    server: {
      ...config.server,
      port: 0,
      watch: null,
      proxy: { '/': { ...config.server.proxy['/'], target: upstreamOrigin } },
    },
  });
  await proxy.listen();
  origin = `http://127.0.0.1:${(proxy.httpServer!.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await proxy?.close();
  if (upstream) {
    upstream.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('forwards method, query, body and cookies and adapts Host, Origin and Referer', async () => {
  const response = await fetch(`${origin}/proxy/api/example?q=1`, {
    method: 'POST',
    headers: {
      origin,
      referer: `${origin}/orders.html`,
      cookie: 'synthetic=1',
      'content-type': 'application/json',
    },
    body: '{"synthetic":true}',
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ synthetic: true });
  expect(received?.url).toBe('/proxy/api/example?q=1');
  expect(received?.method).toBe('POST');
  expect(received?.body).toBe('{"synthetic":true}');
  expect(received?.headers).toMatchObject({
    host: new URL(upstreamOrigin).host,
    origin: upstreamOrigin,
    referer: `${upstreamOrigin}/orders.html`,
    cookie: 'synthetic=1',
  });
});

it('uses built-in redirect and cookie domain rewrites while preserving cookie protections', async () => {
  const response = await fetch(`${origin}/redirect`, { redirect: 'manual' });
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe(`${origin}/login.html`);
  expect(response.headers.getSetCookie()).toEqual([
    'synthetic=1; Path=/; Secure; HttpOnly; SameSite=None',
    'other=2; Path=/; HttpOnly',
  ]);
  expect(received?.url).toBe('/redirect');
});

it('passes compressed HTML and CSP through without rewriting the document', async () => {
  const response = await fetch(`${origin}/compressed`);
  expect(response.headers.get('content-encoding')).toBe('gzip');
  expect(response.headers.get('content-security-policy')).toBe(
    "default-src 'self'",
  );
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.text()).toBe(
    '<a href="https://mobile.pinduoduo.com/orders.html">synthetic</a>',
  );
  expect(await (await fetch(`${origin}/binary`)).arrayBuffer()).toEqual(
    Uint8Array.from([0, 255, 128, 1]).buffer,
  );
});

it('rejects foreign origins and hosts before contacting upstream', async () => {
  expect(
    (await fetch(origin, { headers: { origin: 'https://example.test' } }))
      .status,
  ).toBe(403);
  expect(
    await new Promise<number | undefined>((resolve, reject) => {
      http
        .get(origin, { headers: { host: 'example.test' } }, (response) => {
          response.resume();
          resolve(response.statusCode);
        })
        .on('error', reject);
    }),
  ).toBe(403);
  expect(received).toBeUndefined();
});

it('proxies local-looking paths instead of serving repository files', async () => {
  const response = await fetch(`${origin}/package.json`);
  expect(await response.json()).toEqual({ synthetic: true });
  expect(received?.url).toBe('/package.json');
});

it('returns 502 on upstream failure without logging request details', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect((await fetch(`${origin}/failure`)).status).toBe(502);
  expect(log).toHaveBeenCalledWith('代理请求失败，请检查网络或上游服务。');
  expect(log.mock.calls.flat().join(' ')).not.toContain('/failure');
});
