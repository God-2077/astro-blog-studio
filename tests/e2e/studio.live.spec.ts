import { expect, request, test } from '@playwright/test';

const token = process.env.GITHUB_TEST_TOKEN;
const slug = process.env.GITHUB_TEST_REPO ?? 'God-2077/astro-blog-content-test';
const branch = process.env.GITHUB_TEST_BRANCH ?? 'main';
const password = process.env.E2E_PASSWORD ?? 'studio-e2e-password';
const [owner, name] = slug.split('/');
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const filePath = `src/_e2e/${runId}/studio-e2e.md`;
const fileText = `---
title: 'E2E 测试'
date: '2026-01-01 00:00:00'
---
E2E fixture, please clean up.
`;

function apiHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${token ?? ''}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

test.describe('live studio', () => {
  test.skip(!token, 'GITHUB_TEST_TOKEN is required for the live E2E project');

  test.beforeAll(async () => {
    if (!token) return;
    const api = await request.newContext({ baseURL: 'https://api.github.com', extraHTTPHeaders: apiHeaders() });
    const response = await api.put(`/repos/${owner}/${name}/contents/${filePath}`, {
      data: {
        message: `test: e2e create ${runId}`,
        content: Buffer.from(fileText, 'utf8').toString('base64'),
        branch,
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    await api.dispose();
  });

  test.afterAll(async () => {
    if (!token) return;
    const api = await request.newContext({ baseURL: 'https://api.github.com', extraHTTPHeaders: apiHeaders() });
    const current = await api.get(`/repos/${owner}/${name}/contents/${filePath}?ref=${branch}`);
    if (current.ok()) {
      const data = (await current.json()) as { sha: string };
      await api.delete(`/repos/${owner}/${name}/contents/${filePath}`, {
        data: { message: `test: e2e cleanup ${runId}`, sha: data.sha, branch },
      });
    }
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // The vault redirect happens after the app hydrates; wait for it instead of
    // inspecting the hash immediately after load.
    await page
      .waitForFunction(
        () =>
          location.hash.includes('/unlock') ||
          location.hash.includes('/setup') ||
          document.body.innerText.includes('今天写点什么'),
        undefined,
        { timeout: 30_000 },
      )
      .catch(() => {});

    if (page.url().includes('/unlock')) {
      const input = page.locator('input[type="password"]');
      await expect(input).toBeVisible({ timeout: 15_000 });
      await input.fill(password);
      await page.getByRole('button', { name: /揭开封印/ }).click();
    }
    await expect(page.getByText('今天写点什么？')).toBeVisible({ timeout: 60_000 });
  });

  test('opens a real file, saves it, and exposes the commit receipt', async ({ page }) => {
    await page.goto(`/#/edit?path=${encodeURIComponent(filePath)}`);
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.cm-content')).toContainText('E2E fixture, please clean up.');

    const title = page.locator('section.abs-paper').filter({ hasText: 'FRONTMATTER' }).locator('input.abs-input').first();
    await title.fill('E2E 测试（live）');
    await page.locator('.abs-stamp').click();
    await expect(page.getByRole('button', { name: '确认盖章' })).toBeVisible();
    await page.getByRole('button', { name: '确认盖章' }).click();
    await expect(page.getByText('已提交 · 1 个提交')).toBeVisible({ timeout: 30_000 });

    await page.locator('.abs-brand').click();
    await expect(page.getByText('已归档')).toBeVisible();
    const link = page.locator('.abs-receipt a');
    await expect(link).toHaveAttribute('href', /github\.com\/.*\/commit\//);
  });
});
