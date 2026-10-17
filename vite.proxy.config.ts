import { createLogger, type UserConfig } from 'vite';

// Vite's default proxy error includes the URL, which may contain account data.
const logger = createLogger();
logger.error = () => console.error('代理请求失败，请检查网络或上游服务。');

export default {
  appType: 'custom',
  publicDir: false,
  customLogger: logger,
  plugins: [
    {
      name: 'local-proxy-access',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const host = req.headers.host || '';
          if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
            res.writeHead(403).end('Local requests only');
            return;
          }
          if (req.headers.origin && req.headers.origin !== `http://${host}`) {
            res.writeHead(403).end('Cross-origin requests are not allowed');
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    open: false,
    cors: false,
    ws: false,
    hmr: false,
    proxy: {
      '/': {
        target: 'https://mobile.pinduoduo.com',
        changeOrigin: true,
        secure: true,
        followRedirects: false,
        autoRewrite: true,
        protocolRewrite: 'http',
        cookieDomainRewrite: '',
        proxyTimeout: 30_000,
        configure(proxy, options) {
          proxy.on('proxyReq', (proxyReq, req) => {
            const target = String(options.target);
            if (req.headers.origin) proxyReq.setHeader('origin', target);
            if (req.headers.referer) {
              const localOrigin = `http://${req.headers.host}`;
              const referer = req.headers.referer;
              if (referer.startsWith(`${localOrigin}/`)) {
                proxyReq.setHeader(
                  'referer',
                  target + referer.slice(localOrigin.length),
                );
              }
            }
          });
          proxy.on('proxyRes', (response) => {
            response.headers['cache-control'] = 'no-store';
          });
        },
      },
    },
  },
} satisfies UserConfig;
