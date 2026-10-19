import { expect, type Page, request, test } from '@playwright/test';

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

interface RawBackupRow {
  v?: number;
  alg?: string;
  iv?: string;
  ciphertext?: string;
}

/** Reads the raw IndexedDB rows so the test can prove the draft is not plaintext. */
async function readRawBackups(page: Page): Promise<RawBackupRow[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('abs-backups');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction('backups', 'readonly').objectStore('backups').getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => reject(request.error);
      });
      return rows as RawBackupRow[];
    } finally {
      db.close();
    }
  });
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

  test('keeps an unsaved draft encrypted across a lock and restores it after unlock', async ({ page }) => {
    await page.goto(`/#/edit?path=${encodeURIComponent(filePath)}`);
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 30_000 });

    const title = page.locator('section.abs-paper').filter({ hasText: 'FRONTMATTER' }).locator('input.abs-input').first();
    await title.fill('E2E 加密备份标题');
    await expect(page.getByText('本机已备份', { exact: false })).toBeVisible({ timeout: 15_000 });

    const beforeLock = await readRawBackups(page);
    expect(beforeLock.length).toBeGreaterThan(0);
    expect(JSON.stringify(beforeLock)).not.toContain('E2E 加密备份标题');
    for (const row of beforeLock) {
      expect(row.v).toBe(2);
      expect(row.alg).toBe('AES-GCM');
      expect(row.ciphertext).toBeTruthy();
    }

    await page.getByRole('button', { name: '锁定' }).click();
    await expect(page).toHaveURL(/#\/unlock/, { timeout: 15_000 });
    expect(JSON.stringify(await readRawBackups(page))).not.toContain('E2E 加密备份标题');

    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /揭开封印/ }).click();
    await expect(page.getByText('今天写点什么？')).toBeVisible({ timeout: 30_000 });

    await page.goto(`/#/edit?path=${encodeURIComponent(filePath)}`);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('发现未保存的备份')).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: '恢复备份' }).click();
    await expect(title).toHaveValue('E2E 加密备份标题');
  });
});
