import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const authFile = 'tests/e2e/.auth/live.json';

setup('create the encrypted live vault', async ({ page }) => {
  const token = process.env.GITHUB_TEST_TOKEN;
  const repo = process.env.GITHUB_TEST_REPO ?? 'God-2077/astro-blog-content-test';
  const password = process.env.E2E_PASSWORD ?? 'studio-e2e-password';

  if (!token) throw new Error('GITHUB_TEST_TOKEN is missing; fill .env.local before running the live E2E project.');

  await page.goto('/');
  await expect(page).toHaveURL(/#\/setup/, { timeout: 30_000 });

  await page.locator('input[type="password"]').first().fill(token);
  await page.locator('input[placeholder*="God-2077"]').fill(repo);
  // Password-only keeps the live suite independent from fingerprint sources;
  // strict two-factor is covered by unit tests and the manual checklist.
  await page.getByRole('radio', { name: '密码', exact: true }).check();
  await page.locator('input[placeholder="设置一个密码"]').fill(password);

  await page.getByRole('button', { name: /连接仓库/ }).click();
  await expect(page.getByText('今天写点什么？')).toBeVisible({ timeout: 90_000 });

  mkdirSync(dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
