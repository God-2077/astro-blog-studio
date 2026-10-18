import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const baseURL = process.env.STUDIO_E2E_BASE_URL ?? 'http://localhost:5173';
/** PWA 只对着生产构建验证（dev 不注册 Service Worker），所以单独跑 vite preview。 */
const pwaBaseURL = 'http://localhost:4174';
const authFile = 'tests/e2e/.auth/live.json';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    channel: 'msedge',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
      use: { channel: 'msedge' },
    },
    {
      name: 'demo',
      testMatch: /demo\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'msedge', storageState: { cookies: [], origins: [] } },
    },
    {
      name: 'live',
      testMatch: /(studio\.live|new-post\.live)\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], channel: 'msedge', storageState: authFile },
    },
    {
      name: 'pwa',
      testMatch: /pwa\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'msedge',
        baseURL: pwaBaseURL,
        storageState: { cookies: [], origins: [] },
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // pwa 组要验的是构建产物：先 vite build 再 preview（不重复跑 tsc）。
      command: 'pnpm exec vite build && pnpm preview',
      url: pwaBaseURL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
