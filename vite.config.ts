import { defineConfig } from "vite";
import ttsc from "@ttsc/unplugin/vite";
import monkey, { cdn } from "vite-plugin-monkey";
import proxyConfig from "./build/proxy.ts";
import { getUserscriptVersion } from "./build/version.ts";
import { resolveLibrary } from "./build/libraries.ts";

export default defineConfig(({ mode, command, isPreview }) => {
  if (mode === "proxy" && command === "serve" && !isPreview) {
    return proxyConfig;
  }
  const standalone = mode === "standalone";
  return {
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
      cors: false,
    },
    // 避免依赖扫描阶段再次触发应用 TypeScript 的 Typia 编译。
    optimizeDeps: {
      noDiscovery: true,
      include: ["papaparse", "acorn", "wretch", "typia", "lit"],
    },
    build: {
      target: "chrome136",
      emptyOutDir: !standalone,
      minify: false,
      rolldownOptions: {
        output: { comments: { legal: true, jsdoc: true, annotation: false } },
      },
    },
    // monkey 处理最终用户脚本包装，放在源码转换插件之后。
    plugins: [
      ttsc(),
      monkey({
        entry: "src/main.ts",
        build: {
          fileName: standalone
            ? "pdd-order-export.standalone.user.js"
            : "pdd-order-export.user.js",
          externalGlobals: standalone
            ? {}
            : {
                lit: [
                  async (version, name) =>
                    (await resolveLibrary(601930, name, version)).globalName,
                  async (version, name) =>
                    (await resolveLibrary(601930, name, version)).url,
                ],
                papaparse: cdn.jsdelivr("Papa", "papaparse.min.js"),
                acorn: cdn.jsdelivr("acorn", "dist/acorn.js"),
                wretch: cdn.jsdelivr("wretch", "dist/bundle/wretch.min.js"),
              },
        },
        userscript: {
          version: getUserscriptVersion(process.cwd()),
          name: standalone
            ? "拼多多订单导出工具（独立版）"
            : "拼多多订单导出工具",
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
