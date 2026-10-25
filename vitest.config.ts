import { defineConfig } from "vitest/config";
import ttsc from "@ttsc/unplugin/vite";

export default defineConfig({
  plugins: [ttsc()],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
