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

    // toast 右侧的 X 可以立即关闭提示，不必等自动消失。
    await page.getByRole('button', { name: '关闭提示' }).click();
    await expect(page.getByText('已提交 · 1 个提交')).toBeHidden();

    await page.locator('.abs-brand').click();
    await expect(page.getByText('已归档')).toBeVisible();
    await expect(page.locator('.abs-receipt')).toContainText('in-memory');
    expect(githubCalls).toEqual([]);
  });

  test('dashboard ranks the whole demo corpus by frontmatter date', async ({ page }) => {
    await page.goto('/?demo=1');

    const sheet = page.locator('.abs-sheet').filter({ hasText: '最近动过' });
    const rows = sheet.locator('ul button');
    await expect(rows.first()).toBeVisible();

    // 12 demo files, 3 hidden by the default exclusions.
    await expect(rows).toHaveCount(9);
    // 便笺-Markdown-备忘单 carries updated 2026-10-17, newer than every other seed.
    // A path-sliced 12-file sample would have skipped this ranking entirely.
    await expect(rows.first()).toContainText('便笺：Markdown 备忘单');
    await expect(sheet).toContainText('全库 9 篇');
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

  test('edits the whole file in source mode and keeps the frontmatter intact', async ({ page }) => {
    await page.goto('/?demo=1');
    await page.locator('.abs-tree-row').filter({ hasText: 'note' }).first().click();
    await page.locator('.abs-tree-row').filter({ hasText: '便笺-Markdown-备忘单.md' }).click();
    await expect(page.locator('.cm-editor')).toBeVisible();

    const frontmatter = page.locator('section.abs-paper').filter({ hasText: 'FRONTMATTER' });
    await frontmatter.locator('input.abs-input').first().fill('源文件标题');

    // 表单里未保存的改动会带进源文件。
    await page.getByRole('button', { name: '源文件' }).click();
    await expect(frontmatter).toHaveCount(0);
    await expect(page.locator('.cm-content')).toContainText('title: 源文件标题');

    // 直接改写整份文件：frontmatter、未知字段与正文一起写。
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    for (const line of [
      '---',
      "title: '源文件改写'",
      "date: '2024-07-21 20:10:28'",
      'custom_key: keep',
      '---',
      '',
      '源文件正文',
    ]) {
      await page.keyboard.type(line);
      await page.keyboard.press('Enter');
    }

    // 切回表单：字段与未知字段都来自源文件。
    await page.getByRole('button', { name: '表单' }).click();
    await expect(frontmatter.locator('input.abs-input').first()).toHaveValue('源文件改写');
    await expect(frontmatter.getByText('1 个未知字段保留')).toBeVisible();
    await expect(page.locator('.abs-preview')).toContainText('源文件正文');

    await page.locator('.abs-stamp').click();
    await page.getByRole('button', { name: '确认盖章' }).click();
    await expect(page.getByText('已提交 · 1 个提交')).toBeVisible();
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

  test('renders {title} in create and update commit templates', async ({ page }) => {
    await page.goto('/?demo=1#/settings');
    const commitSection = page.locator('section.abs-paper').filter({ hasText: '提交消息' });
    const templates = commitSection.locator('input.abs-input');
    await templates.nth(0).fill('create: {title} @ {path}');
    await templates.nth(1).fill('update: {title} @ {path}');
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.getByText('设置已保存')).toBeVisible();

    await page.goto('/?demo=1');
    await page.getByRole('button', { name: '新建文章' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input.abs-input').first().fill('E2E 标题占位符');
    await dialog.getByRole('button', { name: '开始起草' }).click();
    await page.locator('.abs-stamp').click();
    await page.getByRole('button', { name: '确认创建' }).click();
    await expect(page.getByText('已创建并提交 · 1 个提交')).toBeVisible();

    await page.locator('.abs-brand').click();
    await expect(page.locator('.abs-receipt')).toContainText('create: E2E 标题占位符 @ src/content/blog/E2E 标题占位符.md');
  });

  test('switches appearance between system, day and night, and persists the choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/?demo=1#/settings');
    const appearance = page.locator('section.abs-paper').filter({ hasText: '外观' });
    await expect(appearance).toBeVisible();

    // 默认跟随系统：系统为深色时直接是夜。
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

    await appearance.getByRole('button', { name: '昼', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
    await expect(appearance.getByText('当前昼')).toBeVisible();

    // 手动选择覆盖系统，并在刷新后保持。
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');

    await page.getByRole('button', { name: '跟随系统', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  });
});
