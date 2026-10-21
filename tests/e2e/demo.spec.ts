import { expect, type Page, test } from '@playwright/test';

/** 等 sonner 确认条出现，再点其中一个按钮（取代原生 confirm 的 accept）。 */
async function answerConfirm(page: Page, label: string): Promise<void> {
  const confirm = page.locator('[data-abs-confirm]').last();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: label }).click();
  await expect(confirm).toBeHidden();
}

/** 读取编辑器里每种语法 token 的颜色，并换算成对纸面的对比度。 */
async function tokenContrast(page: Page): Promise<Array<{ color: string; ratio: number }>> {
  return page.evaluate(() => {
    const parse = (value: string): [number, number, number] => {
      const text = value.trim();
      if (text.startsWith('#')) {
        const hex = text.slice(1);
        const full =
          hex.length === 3
            ? hex
                .split('')
                .map((part) => part + part)
                .join('')
            : hex;
        return [
          Number.parseInt(full.slice(0, 2), 16) / 255,
          Number.parseInt(full.slice(2, 4), 16) / 255,
          Number.parseInt(full.slice(4, 6), 16) / 255,
        ];
      }
      const body = /^rgba?\(([^)]+)\)$/.exec(text)?.[1];
      if (!body) throw new Error(`unsupported color: ${value}`);
      const [red = 0, green = 0, blue = 0] = body.split(',').map((part) => Number.parseFloat(part));
      return [red / 255, green / 255, blue / 255];
    };
    const channel = (value: number): number => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = ([red = 0, green = 0, blue = 0]: [number, number, number]): number =>
      0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    const contrast = (first: [number, number, number], second: [number, number, number]): number => {
      const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
    };

    const root = document.querySelector('.cm-content');
    if (!root) throw new Error('editor content not found');
    const paper = getComputedStyle(document.documentElement).getPropertyValue('--abs-paper');
    const colors = new Map<string, number>();
    for (const span of root.querySelectorAll('span[class]')) {
      const color = getComputedStyle(span).color;
      colors.set(color, contrast(parse(color), parse(paper)));
    }
    return [...colors].map(([color, ratio]) => ({ color, ratio }));
  });
}

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

    // 切到 date：归档页面修改的 date（2024-07-21 21:02）比备忘单的 20:10 新。
    const dateSort = sheet.getByRole('button', { name: 'date', exact: true });
    await dateSort.click();
    await expect(dateSort).toHaveAttribute('aria-pressed', 'true');
    await expect(rows.first()).toContainText('便笺：归档页面修改');
    await expect(rows.first()).toContainText('2024-07-21');
    // 9 篇不足一页，不显示加载更多。
    await expect(sheet.getByRole('button', { name: '加载更多' })).toHaveCount(0);

    const updatedSort = sheet.getByRole('button', { name: 'updated', exact: true });
    await updatedSort.click();
    await expect(updatedSort).toHaveAttribute('aria-pressed', 'true');
    await expect(rows.first()).toContainText('便笺：Markdown 备忘单');
  });

  test('collapses every settings section on a phone viewport and expands on demand', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?demo=1#/settings');

    const sections = page.locator('section.abs-paper');
    await expect(sections).toHaveCount(8);
    for (let index = 0; index < 8; index += 1) {
      await expect(sections.nth(index)).toHaveAttribute('data-open', 'true');
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.locator('section.abs-paper[data-open="false"]')).toHaveCount(8);

    const contentSection = page.locator('section.abs-paper').filter({ hasText: '内容与排除' });
    const contentHeader = contentSection.getByRole('button', { name: /内容与排除/ });
    await expect(contentHeader).toHaveAttribute('aria-expanded', 'false');
    await contentHeader.click();
    await expect(contentHeader).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('label.abs-field').filter({ hasText: '根目录' }).locator('input')).toBeVisible();

    // 折叠时摘要仍在标题行，页面无横向滚动。
    await expect(page.locator('section.abs-paper').filter({ hasText: '本机文章缓存' })).toContainText('演示模式 · 仅内存');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

  test('persists the index concurrency setting', async ({ page }) => {
    await page.goto('/?demo=1#/settings');
    const concurrency = page.locator('label.abs-field').filter({ hasText: '索引并发' }).locator('input');
    await expect(concurrency).toHaveValue('3');
    await concurrency.fill('6');
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.getByText('设置已保存')).toBeVisible();

    await page.reload();
    await expect(page.locator('label.abs-field').filter({ hasText: '索引并发' }).locator('input')).toHaveValue('6');
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

  test('keeps several drafts in the local draft box and retires one after commit', async ({ page }) => {
    await page.goto('/?demo=1');

    const saveNewDraft = async (title: string, marker: string, carriesPrevious = false): Promise<void> => {
      await page.getByRole('button', { name: '新建文章' }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('input.abs-input').first().fill(title);
      await dialog.getByRole('button', { name: '开始起草' }).click();
      // 第二篇起：上一篇还在内存里，确认后会先存入草稿箱再开新稿。
      if (carriesPrevious) await answerConfirm(page, '存入草稿箱并继续');
      await expect(page.locator('.cm-editor')).toBeVisible();
      await page.locator('.cm-content').click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type(marker);
      await page.getByRole('button', { name: '保存草稿' }).click();
      await expect(page.getByText('已存入本机草稿箱').first()).toBeVisible();
      await page.locator('.abs-brand').click();
      await answerConfirm(page, '离开');
      await expect(page.getByText('今天写点什么？')).toBeVisible();
    };

    await saveNewDraft('草稿甲', '正文甲');
    await saveNewDraft('草稿乙', '正文乙', true);

    // 「最近动过」切换成草稿箱，两篇新稿都在。
    await page
      .getByRole('button', { name: /草稿箱/ })
      .first()
      .click();
    const sheet = page.locator('.abs-sheet');
    await expect(sheet.getByRole('heading', { name: '草稿箱' })).toBeVisible();
    await expect(sheet.getByText('草稿甲', { exact: true })).toBeVisible();
    await expect(sheet.getByText('草稿乙', { exact: true })).toBeVisible();
    await expect(sheet.locator('ul li')).toHaveCount(2);

    // 打开甲：恢复正文，再盖章提交。
    await sheet.getByText('草稿甲', { exact: true }).click();
    await expect(page).toHaveURL(/draft=1/);
    await expect(page.locator('.cm-editor')).toBeVisible();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await expect(page.locator('.cm-content')).toContainText('正文甲');
    const frontmatter = page.locator('section.abs-paper').filter({ hasText: 'FRONTMATTER' });
    await expect(frontmatter.locator('input.abs-input').first()).toHaveValue('草稿甲');

    await page.locator('.abs-stamp').click();
    await page.getByRole('button', { name: '确认创建' }).click();
    await expect(page.getByText('已创建并提交 · 1 个提交')).toBeVisible();

    // 提交后甲从草稿箱移除，乙还在。
    await page.locator('.abs-brand').click();
    await page
      .getByRole('button', { name: /草稿箱/ })
      .first()
      .click();
    await expect(sheet.getByText('草稿乙', { exact: true })).toBeVisible();
    await expect(sheet.getByText('草稿甲', { exact: true })).toHaveCount(0);
    await expect(sheet.locator('ul li')).toHaveCount(1);

    // 删除最后一篇后回到空状态：确认条只删本机草稿，取消则保持原样。
    await sheet.getByRole('button', { name: '从草稿箱删除：草稿乙' }).click();
    await answerConfirm(page, '取消');
    await expect(sheet.getByText('草稿乙', { exact: true })).toBeVisible();

    await sheet.getByRole('button', { name: '从草稿箱删除：草稿乙' }).click();
    await answerConfirm(page, '删除草稿');
    await expect(page.getByText('已从草稿箱删除')).toBeVisible();
    await expect(page.getByText('草稿箱是空的')).toBeVisible();
  });

  test('lists an autosave backup in the draft box', async ({ page }) => {
    await page.goto('/?demo=1');
    await page.locator('.abs-tree-row').filter({ hasText: 'note' }).first().click();
    await page.locator('.abs-tree-row').filter({ hasText: '便笺-Markdown-备忘单.md' }).click();
    await expect(page.locator('.cm-editor')).toBeVisible();

    const frontmatter = page.locator('section.abs-paper').filter({ hasText: 'FRONTMATTER' });
    await frontmatter.locator('input.abs-input').first().fill('备份也是草稿');
    await expect(page.getByText('本机已备份', { exact: false })).toBeVisible({ timeout: 10_000 });

    await page.locator('.abs-brand').click();
    await answerConfirm(page, '离开');
    await expect(page.getByText('今天写点什么？')).toBeVisible();
    await page
      .getByRole('button', { name: /草稿箱/ })
      .first()
      .click();

    const sheet = page.locator('.abs-sheet');
    await expect(sheet.getByText('备份也是草稿', { exact: true })).toBeVisible();
    await expect(sheet.getByText('自动备份', { exact: true })).toBeVisible();

    // 点进草稿箱条目等于从备份恢复，而不是打开远端旧内容。
    await sheet.getByText('备份也是草稿', { exact: true }).click();
    await expect(page).toHaveURL(/draft=1/);
    const restoredTitle = page
      .locator('section.abs-paper')
      .filter({ hasText: 'FRONTMATTER' })
      .locator('input.abs-input')
      .first();
    await expect(restoredTitle).toHaveValue('备份也是草稿');
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

  test('restores a form backup after reload, then clears it on save', async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept());

    await page.goto('/?demo=1');
    await page.locator('.abs-tree-row').filter({ hasText: 'note' }).first().click();
    await page.locator('.abs-tree-row').filter({ hasText: '便笺-Markdown-备忘单.md' }).click();
    await expect(page.locator('.cm-editor')).toBeVisible();

    const frontmatter = page.locator('section.abs-paper').filter({ hasText: 'FRONTMATTER' });
    const title = frontmatter.locator('input.abs-input').first();
    await title.fill('本机备份标题');
    await expect(page.getByText('本机已备份', { exact: false })).toBeVisible({ timeout: 10_000 });

    await page.reload();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('发现未保存的备份')).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: '稍后' }).click();
    await expect(page.getByText('本机有一份未保存的备份', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: '恢复', exact: true }).click();

    await expect(frontmatter.locator('input.abs-input').first()).toHaveValue('本机备份标题');
    await expect(page.getByText('未保存').first()).toBeVisible();

    await page.locator('.abs-stamp').click();
    await expect(page.getByRole('button', { name: '确认盖章' })).toBeVisible();
    await page.getByRole('button', { name: '确认盖章' }).click();
    await expect(page.getByText('已提交 · 1 个提交')).toBeVisible();

    await page.reload();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('restores a source-mode backup and keeps the source view', async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept());

    await page.goto('/?demo=1');
    await page.locator('.abs-tree-row').filter({ hasText: 'note' }).first().click();
    await page.locator('.abs-tree-row').filter({ hasText: '便笺-Markdown-备忘单.md' }).click();
    await expect(page.locator('.cm-editor')).toBeVisible();

    await page.getByRole('button', { name: '源文件' }).click();
    await expect(page.getByRole('button', { name: '源文件' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n\n源文件备份标记');
    await expect(page.getByText('本机已备份', { exact: false })).toBeVisible({ timeout: 10_000 });

    await page.reload();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('发现未保存的备份')).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: '恢复备份' }).click();

    await expect(page.getByRole('button', { name: '源文件' })).toHaveAttribute('aria-pressed', 'true');
    // CodeMirror 只渲染可见行；跳到文末让打字标记进入 DOM 再断言。
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await expect(page.locator('.cm-content')).toContainText('源文件备份标记');
  });

  test('discards a local backup and does not ask again', async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept());

    await page.goto('/?demo=1');
    await page.locator('.abs-tree-row').filter({ hasText: 'note' }).first().click();
    await page.locator('.abs-tree-row').filter({ hasText: '便笺-Markdown-备忘单.md' }).click();
    await expect(page.locator('.cm-editor')).toBeVisible();

    const frontmatter = page.locator('section.abs-paper').filter({ hasText: 'FRONTMATTER' });
    const title = frontmatter.locator('input.abs-input').first();
    const originalTitle = await title.inputValue();
    await title.fill('会被丢弃的标题');
    await expect(page.getByText('本机已备份', { exact: false })).toBeVisible({ timeout: 10_000 });

    await page.reload();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('发现未保存的备份')).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: '丢弃备份' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(title).toHaveValue(originalTitle);
    await expect(page.getByText('已丢弃本机备份')).toBeVisible();

    await page.reload();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('restores a new-post draft from a local backup after a reload', async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept());

    await page.goto('/?demo=1');
    await page.getByRole('button', { name: '新建文章' }).first().click();
    const newPostDialog = page.getByRole('dialog');
    await newPostDialog.locator('input.abs-input').first().fill('E2E 备份新稿');
    await newPostDialog.getByRole('button', { name: '开始起草' }).click();
    await expect(page).toHaveURL(/new=1/);
    await expect(page.locator('.cm-editor')).toBeVisible();

    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n\n新稿备份正文');
    await expect(page.getByText('本机已备份', { exact: false })).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page).toHaveURL(/new=1/);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('发现未保存的备份')).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: '恢复备份' }).click();

    await expect(page.getByText('未提交').first()).toBeVisible();
    const frontmatter = page.locator('section.abs-paper').filter({ hasText: 'FRONTMATTER' });
    await expect(frontmatter.locator('input.abs-input').first()).toHaveValue('E2E 备份新稿');
    await expect(page.locator('.cm-content')).toContainText('新稿备份正文');
  });

  test('keeps markdown syntax readable in both night and day themes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/?demo=1');
    await page.locator('.abs-tree-row').filter({ hasText: 'note' }).first().click();
    await page.locator('.abs-tree-row').filter({ hasText: '便笺-Markdown-备忘单.md' }).click();
    await expect(page.locator('.cm-editor')).toBeVisible();

    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    // insertText 绕过 closeBrackets 的自动补全，避免 []/()/`` 被成对插入。
    await page.keyboard.insertText(
      '\n\n## 颜色标题\n\n> 引用\n\n---\n\n- [x] 任务\n\n**粗体** *斜体* ~~删除~~\n\n`代码`\n\n[链接](https://example.com "标题")\n\n<!-- 注释 -->\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n',
    );
    await expect(page.locator('.cm-content')).toContainText('颜色标题');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');

    const night = await tokenContrast(page);
    expect(night.length).toBeGreaterThanOrEqual(5);
    for (const token of night) {
      expect(token.ratio, `${token.color} on night paper`).toBeGreaterThanOrEqual(4.5);
    }
    expect(night.map((token) => token.color)).not.toContain('rgb(34, 17, 153)');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
    const day = await tokenContrast(page);
    expect(day.length).toBeGreaterThanOrEqual(5);
    for (const token of day) {
      expect(token.ratio, `${token.color} on day paper`).toBeGreaterThanOrEqual(4.5);
    }
    expect(day.map((token) => token.color)).not.toEqual(night.map((token) => token.color));
  });
});
