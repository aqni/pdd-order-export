import { defineConfig } from "vitest/config";
import ttsc from "@ttsc/unplugin/vite";
import vueJsx from "@vitejs/plugin-vue-jsx";

export default defineConfig({
  plugins: [ttsc(), vueJsx()],
  test: {
    clearMocks: true,
    restoreMocks: true,
    retry: 0,
    allowOnly: !process.env.CI,
    maxWorkers: process.env.CI ? 2 : undefined,
    expect: { poll: { timeout: 5000 } },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          // 多个 Vite 服务共享依赖预构建缓存，串行启动以避免冷缓存竞争。
          fileParallelism: false,
          include: ["tests/integration/*.test.ts"],
        },
      },
    ],
  },
});
