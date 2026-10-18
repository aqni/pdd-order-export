import {
  createLogger,
  defineConfig,
  type Plugin,
  type ProxyOptions,
} from "vite";

const siteProxy = {
  "/": {
    target: "https://mobile.pinduoduo.com",
    changeOrigin: true,
    secure: true,
    followRedirects: false,
    cookieDomainRewrite: "",
    proxyTimeout: 30_000,
    configure(proxy, options) {
      proxy.on("proxyReq", (proxyReq, req) => {
        const target = String(options.target);
        if (req.headers.origin) proxyReq.setHeader("origin", target);
        const localOrigin = `http://${req.headers.host}`;
        const referer = req.headers.referer;
        if (referer?.startsWith(localOrigin + "/")) {
          proxyReq.setHeader(
            "referer",
            target + referer.slice(localOrigin.length),
          );
        }
      });
      proxy.on("proxyRes", (response) => {
        response.headers["cache-control"] = "no-store";
        const location = response.headers.location;
        if (location) {
          const target = new URL(String(options.target));
          const redirect = new URL(location, target);
          if (redirect.origin === target.origin) {
            response.headers.location =
              redirect.pathname + redirect.search + redirect.hash;
          }
        }
      });
    },
  },
} satisfies Record<string, ProxyOptions>;

function localProxy(): Plugin {
  // Vite's proxy errors include URLs that may contain account data.
  const logger = createLogger();
  logger.error = () => console.error("代理请求失败，请检查网络或上游服务。");
  return {
    name: "local-proxy",
    config() {
      return {
        customLogger: logger,
      };
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host || "";
        if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
          res.writeHead(403).end("Local requests only");
          return;
        }
        if (req.headers.origin && req.headers.origin !== `http://${host}`) {
          res.writeHead(403).end("Cross-origin requests are not allowed");
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  appType: "custom",
  publicDir: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [localProxy()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
    open: false,
    cors: false,
    ws: false,
    hmr: false,
    proxy: siteProxy,
  },
});
