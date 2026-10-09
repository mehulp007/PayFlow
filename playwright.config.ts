import { defineConfig } from '@playwright/test';

/** End-to-end tests run against a separate API (in-memory database) and web server on their own ports. */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    // Locally, use the installed Microsoft Edge; CI installs Playwright's Chromium.
    channel: process.env.CI ? undefined : 'msedge',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev -w @payflow/api',
      url: 'http://127.0.0.1:4100/api/health',
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        PORT: '4100',
        PAYFLOW_DATA_DIRECTORY: 'memory',
        PAYFLOW_SEED_SIZE: '200',
        PAYFLOW_DEMO_PASSWORD: 'E2E-Password-2026!',
        PAYFLOW_LOGIN_RATE_LIMIT: '1000',
      },
    },
    {
      command: 'npm run dev -w @payflow/web -- --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      timeout: 120_000,
      reuseExistingServer: false,
      env: { PAYFLOW_API_URL: 'http://127.0.0.1:4100' },
    },
  ],
});
