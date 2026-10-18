import { defineConfig } from "vitest/config";
import { withFilter } from "vite";
import ttsc from "@ttsc/unplugin/vite";

export default defineConfig({
  plugins: [withFilter(ttsc(), { transform: { code: /\btypia\b/ } })],
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
          include: ["tests/integration/*.test.ts"],
        },
      },
    ],
  },
});
