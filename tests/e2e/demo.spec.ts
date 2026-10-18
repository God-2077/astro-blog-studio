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

    const frontmatter = page.locator('section.abs-paper').filter({ hasText: 'FRONTMATTER' });
    const title = frontmatter.locator('input.abs-input').first();
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

  test('adds a frontmatter field in settings and renders it in the editor', async ({ page }) => {
    await page.goto('/?demo=1#/settings');
    const fieldsSection = page.locator('section.abs-paper').filter({ hasText: 'Frontmatter 字段' });
    await expect(fieldsSection).toBeVisible();
    await fieldsSection.locator('button[aria-label="删除字段 sticky"]').click();
    await fieldsSection.getByRole('button', { name: /添加字段/ }).click();
    await fieldsSection.locator('input.abs-input').last().fill('subtitle');
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.getByText('设置已保存')).toBeVisible();

    await page.goto(
      '/?demo=1#/edit?path=src%2Fcontent%2Fblog%2Fnote%2F%E4%BE%BF%E7%AC%BA-Markdown-%E5%A4%87%E5%BF%98%E5%8D%95.md',
    );
    const frontmatter = page.locator('section.abs-paper').filter({ hasText: 'FRONTMATTER' });
    await expect(frontmatter.getByText('subtitle')).toBeVisible();
    await expect(frontmatter.getByText('1 个未知字段保留')).toBeVisible();
  });

  test('creates a new article locally and commits it only on save', async ({ page }) => {
    await page.goto('/?demo=1');
    await page.getByRole('button', { name: '新建文章' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input.abs-input').first().fill('E2E 新建稿');
    await dialog.getByRole('button', { name: '开始起草' }).click();

    await expect(page).toHaveURL(/new=1/);
    await expect(page.getByText('未提交').first()).toBeVisible();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.getByText('新文件 · 保存时创建')).toBeVisible();

    await page.locator('.abs-stamp').click();
    await expect(page.getByRole('button', { name: '确认创建' })).toBeVisible();
    await page.getByRole('button', { name: '确认创建' }).click();
    await expect(page.getByText('已创建并提交 · 1 个提交')).toBeVisible();
    await expect(page).not.toHaveURL(/new=1/);

    await page.locator('.abs-brand').click();
    await expect(page.locator('.abs-receipt')).toContainText('create: src/content/blog/E2E 新建稿.md');
    await expect(page.locator('.abs-tree-row').filter({ hasText: 'E2E 新建稿.md' })).toBeVisible();
  });
});
