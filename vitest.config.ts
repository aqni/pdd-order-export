import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { shopCommands } from './tests/browser/commands.ts';

// Only integration tests explicitly start Vite with the userscript plugin.
export default defineConfig({
  test: {
    clearMocks: true,
    restoreMocks: true,
    allowOnly: !process.env.CI,
    retry: 0,
    maxWorkers: process.env.CI ? 2 : undefined,
    expect: { poll: { timeout: 5000 } },
    attachmentsDir: 'test-results/attachments',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/browser/*.test.ts'],
          testTimeout: 20000,
          browser: {
            enabled: true,
            headless: true,
            ui: false,
            provider: playwright({
              launchOptions: { channel: process.env.PLAYWRIGHT_CHANNEL },
              actionTimeout: 5000,
            }),
            instances: [{ browser: 'chromium' }],
            viewport: { width: 1280, height: 720 },
            commands: shopCommands,
            screenshotFailures: true,
            screenshotDirectory: 'test-results/screenshots',
            trace: {
              mode: 'retain-on-failure',
              tracesDir: 'test-results/traces',
            },
          },
        },
      },
    ],
  },
});
