import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "./tests/browser/setup.mjs",
});
