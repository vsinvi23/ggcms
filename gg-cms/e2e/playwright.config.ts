import { defineConfig, devices } from '@playwright/test';

process.env.BYPASS_RATE_LIMIT = process.env.BYPASS_RATE_LIMIT || '1';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // run sequentially to avoid token conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
  timeout: 30_000,

  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:8081',
    env: {
      BYPASS_RATE_LIMIT: '1',
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
