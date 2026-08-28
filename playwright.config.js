import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    bypassCSP: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.11' } },
    },
    {
      name: 'android-chromium',
      use: { ...devices['Pixel 7'], extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.12' } },
    },
    {
      name: 'iphone-webkit',
      use: { ...devices['iPhone 13'], extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.13' } },
    },
    {
      name: 'tablet-webkit',
      use: { ...devices['iPad Mini'], extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.14' } },
    },
  ],
  webServer: {
    command: 'node scripts/start-playwright-server.mjs',
    url: 'http://127.0.0.1:3100/health',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: '3100',
      NODE_ENV: 'test',
      DEMO_MODE: 'true',
      CLONE_LOCAL_TEST_ANSWER: 'true',
      SESSION_SECRET: 'browser-tests-session-secret-32-chars-minimum',
      APP_URL: 'http://127.0.0.1:3100',
    },
  },
});
