import { expect, test } from '@playwright/test';

test.describe('demo mode', () => {
  test('opens the workbench, saves a note, and shows the in-memory receipt', async ({ page }) => {
    const githubCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('api.github.com')) githubCalls.push(request.url());
    });

    await page.goto('/?demo=1');
    await expect(page.getByText('今天写点什么？')).toBeVisible();
    await expect(page.getByText('演示模式', { exact: false }).first()).toBeVisible();

    await page.locator('.abs-tree-row').filter({ hasText: 'note' }).first().click();
    await page.locator('.abs-tree-row').filter({ hasText: '便笺-Markdown-备忘单.md' }).click();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.locator('.abs-preview')).toBeVisible();

    const title = page.locator('section.abs-paper').filter({ hasText: 'FRONTMATTER' }).locator('input.abs-input').first();
    await title.fill('便笺：E2E 备忘单');
    await page.locator('.abs-stamp').click();
    await expect(page.getByRole('button', { name: '确认盖章' })).toBeVisible();
    await page.getByRole('button', { name: '确认盖章' }).click();
    await expect(page.getByText('已提交 · 1 个提交')).toBeVisible();

    await page.locator('.abs-brand').click();
    await expect(page.getByText('已归档')).toBeVisible();
    await expect(page.locator('.abs-receipt')).toContainText('in-memory');
    expect(githubCalls).toEqual([]);
  });
});
