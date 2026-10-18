import { defineConfig, withFilter } from "vite";
import ttsc from "@ttsc/unplugin/vite";
import monkey, { cdn } from "vite-plugin-monkey";
import proxyConfig from "./build/proxy.ts";
import { getUserscriptVersion } from "./build/version.ts";

export default defineConfig(({ mode, command, isPreview }) => {
  if (mode === "proxy" && command === "serve" && !isPreview) {
    return proxyConfig;
  }
  return {
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
      cors: false,
    },
    // Keep dependency scanning from compiling application TypeScript a second time.
    optimizeDeps: {
      noDiscovery: true,
      include: ["papaparse", "acorn", "wretch", "typia"],
    },
    build: {
      target: "es2022",
      minify: false,
      rolldownOptions: { output: { comments: true } },
    },
    // Keep monkey last if other Vite plugins are added.
    plugins: [
      withFilter(ttsc(), { transform: { code: /\btypia\b/ } }),
      monkey({
        server: { open: mode === "test" ? false : undefined },
        entry: "src/main.ts",
        build: {
          externalGlobals: {
            papaparse: cdn.jsdelivr("Papa", "papaparse.min.js"),
            acorn: cdn.jsdelivr("acorn", "dist/acorn.js"),
            wretch: cdn.jsdelivr("wretch", "dist/bundle/wretch.min.js"),
          },
        },
        userscript: {
          version: getUserscriptVersion(process.cwd()),
          name: "拼多多订单导出工具",
          namespace: "http://tampermonkey.net/",
          author: "aqnin@outlook.com",
          icon: "https://www.google.com/s2/favicons?sz=64&domain=pinduoduo.com",
          homepageURL: "https://github.com/aqni/pdd-order-export",
          match: ["https://mobile.pinduoduo.com/orders.html*"],
          grant: "none",
          "run-at": "document-end",
          noframes: true,
        },
      }),
    ],
  };
});
