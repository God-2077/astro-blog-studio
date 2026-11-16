import { expect, type Page, type Route, test } from '@playwright/test';

const password = process.env.E2E_PASSWORD ?? 'studio-e2e-password';
const daybookRepo = 'mock-owner/daybook';

type MockFile = { path: string; sha: string; text: string };

const files: Record<string, MockFile[]> = {};

interface MockState {
  pat: string;
  authSeen: Set<string>;
  graphqlCalls: number;
}

function apiHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization, x-github-api-version, content-type, accept',
    'access-control-expose-headers': 'x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset',
    'content-type': 'application/json',
  };
}

function installGitHubMock(state: MockState) {
  return async (route: Route): Promise<void> => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: apiHeaders() });
      return;
    }
    const url = new URL(request.url());
    state.authSeen.add(request.headers().authorization ?? '');

    if (url.pathname === '/graphql') {
      state.graphqlCalls += 1;
      let variables: Record<string, string> = {};
      try {
        const body = request.postDataJSON() as { variables?: Record<string, string> };
        variables = body.variables ?? {};
      } catch {
        // A malformed body simply yields no files.
      }
      const repository: Record<string, { oid: string; byteSize: number; text: string } | null> = {};
      for (const [key, expression] of Object.entries(variables)) {
        const alias = /^e(\d+)$/.exec(key);
        if (!alias) continue;
        const path = expression.slice(expression.indexOf(':') + 1);
        const file = (files[daybookRepo] ?? []).find((entry) => entry.path === path);
        repository[`f${alias[1]}`] = file ? { oid: file.sha, byteSize: file.text.length, text: file.text } : null;
      }
      await route.fulfill({ status: 200, headers: apiHeaders(), body: JSON.stringify({ data: { repository } }) });
      return;
    }

    const match = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!match) {
      await route.fulfill({ status: 404, headers: apiHeaders(), body: JSON.stringify({ message: 'Not Found' }) });
      return;
    }
    const [, owner = '', name = '', rest = ''] = match;
    const slug = `${owner}/${name}`;
    if (slug !== daybookRepo) {
      await route.fulfill({ status: 404, headers: apiHeaders(), body: JSON.stringify({ message: 'Not Found' }) });
      return;
    }

    if (!rest) {
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({
          default_branch: 'main',
          private: true,
          permissions: { push: true },
          html_url: `https://github.com/${slug}`,
        }),
      });
      return;
    }
    if (rest.startsWith('/git/trees/')) {
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({
          sha: 'tree-daybook',
          tree: (files[slug] ?? []).map((file) => ({
            path: file.path,
            type: 'blob',
            sha: file.sha,
            size: file.text.length,
          })),
          truncated: false,
        }),
      });
      return;
    }
    if (rest.startsWith('/contents/')) {
      const path = decodeURIComponent(rest.slice('/contents/'.length));
      const file = (files[slug] ?? []).find((entry) => entry.path === path);
      if (!file) {
        await route.fulfill({ status: 404, headers: apiHeaders(), body: JSON.stringify({ message: 'Not Found' }) });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({
          type: 'file',
          encoding: 'base64',
          size: file.text.length,
          name: file.path.split('/').pop() ?? file.path,
          path: file.path,
          sha: file.sha,
          content: Buffer.from(file.text, 'utf8').toString('base64'),
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: apiHeaders(), body: JSON.stringify({ message: 'Not Found' }) });
  };
}

function shanghaiToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

test.describe('daybook content repository (mocked GitHub)', () => {
  test('indexes only daybook directories/config files and creates a numbered diary', async ({ page }: { page: Page }) => {
    const today = shanghaiToday();
    const state: MockState = { pat: 'pat-daybook', authSeen: new Set(), graphqlCalls: 0 };
    files[daybookRepo] = [
      {
        path: `daily/${today}-01.md`,
        sha: 'blob-daily',
        text: `---\ndate: '${today}'\ntitle: '今天的日记'\n---\n今天已经写了一篇。\n`,
      },
      {
        path: 'post/hello-content-repo.md',
        sha: 'blob-post',
        text: "---\ndate: '2026-01-02'\ntitle: '内容仓库文章'\ncategories: []\ntags: []\n---\n文章正文\n",
      },
      {
        path: 'pages/guestbook.md',
        sha: 'blob-page',
        text: "---\ntitle: '留言板'\ndate: '2026-01-03'\n---\n留言板正文\n",
      },
      { path: 'config/site.ts', sha: 'blob-site', text: "export const site = { title: 'Daybook' };\n" },
      { path: 'config/links.ts', sha: 'blob-links', text: 'export const links = [];\n' },
      { path: 'spec/about.mdx', sha: 'blob-about', text: '这是关于页正文。\n' },
      { path: 'README.md', sha: 'blob-readme', text: '# Daybook\n' },
      { path: 'schema.ts', sha: 'blob-schema', text: 'export const dailySchema = {};\n' },
    ];
    await page.route('https://api.github.com/**', installGitHubMock(state));

    await page.goto('/');
    await expect(page).toHaveURL(/#\/setup/, { timeout: 30_000 });
    await page.locator('input[placeholder="github_pat_…"]').fill(state.pat);
    await page.locator('input[placeholder*="God-2077"]').fill(daybookRepo);
    await page.getByRole('checkbox', { name: /作为 daybook 内容仓库/ }).check();
    const setupRoot = page.locator('label.abs-field').filter({ hasText: '根目录' }).locator('input');
    await expect(setupRoot).toBeDisabled();
    await expect(setupRoot).toHaveValue('');
    await page.getByRole('radio', { name: '密码', exact: true }).check();
    await page.locator('input[placeholder="设置一个密码"]').fill(password);
    await page.getByRole('button', { name: /连接仓库/ }).click();
    await expect(page.getByText('今天写点什么？')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('今天的日记')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => state.graphqlCalls).toBe(1);

    // Exactly the daybook directories and auxiliary files enter the index card.
    for (const path of [
      `daily/${today}-01.md`,
      'post/hello-content-repo.md',
      'pages/guestbook.md',
      'config/site.ts',
      'config/links.ts',
      'spec/about.mdx',
    ]) {
      await expect(page.locator(`.abs-tree-row[title="${path}"]`).first()).toBeVisible();
    }
    await expect(page.locator('.abs-tree-row[title="README.md"]')).toHaveCount(0);
    await expect(page.locator('.abs-tree-row[title="schema.ts"]')).toHaveCount(0);
    await expect(page.locator('.abs-tree-row[title="public/avatar.svg"]')).toHaveCount(0);

    // The fixed daybook field editor is hidden in settings; the root directory is the repo root.
    await page.locator('.abs-topbar').getByRole('link', { name: '设置', exact: true }).click();
    const contentSection = page.locator('section.abs-paper').filter({ hasText: '内容与排除' });
    const settingsRoot = contentSection.locator('label.abs-field').filter({ hasText: '根目录' }).locator('input');
    await expect(settingsRoot).toBeDisabled();
    await expect(settingsRoot).toHaveValue('');
    await expect(page.getByRole('button', { name: /Frontmatter 字段/ })).toHaveCount(0);
    await page.locator('.abs-brand').click();
    await expect(page.getByText('今天写点什么？')).toBeVisible({ timeout: 30_000 });

    // Dashboard 新建 opens the type chooser instead of the generic post dialog.
    const newButton = page.locator('.abs-btn-primary').filter({ hasText: '新建' }).first();
    await expect(newButton).toBeVisible();
    await newButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '新建什么？' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^日记/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^文章/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^单独页面/ })).toBeVisible();

    // Article and standalone page use the same second dialog with fixed dirs.
    await dialog.getByRole('button', { name: /^文章/ }).click();
    await expect(dialog.getByRole('heading', { name: '新建文章' })).toBeVisible();
    await expect(dialog.getByLabel('目录')).toHaveValue('post');
    await expect(dialog.getByLabel('目录')).toBeDisabled();
    await expect(dialog.getByLabel('标题', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('文件名')).toHaveValue('');
    await dialog.getByRole('button', { name: '返回类型选择' }).first().click();
    await expect(dialog.getByRole('heading', { name: '新建什么？' })).toBeVisible();

    await dialog.getByRole('button', { name: /^单独页面/ }).click();
    await expect(dialog.getByRole('heading', { name: '新建单独页面' })).toBeVisible();
    await expect(dialog.getByLabel('目录')).toHaveValue('pages');
    await expect(dialog.getByLabel('目录')).toBeDisabled();
    await expect(dialog.getByLabel('标题', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '返回类型选择' }).first().click();

    await dialog.getByRole('button', { name: /^日记/ }).click();
    await expect(dialog.getByRole('heading', { name: '新建日记' })).toBeVisible();
    await expect(dialog.getByLabel('文件名')).toHaveValue(`${today}-02`);
    await expect(dialog.getByLabel('标题（可选）', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: /开始起草/ }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => decodeURIComponent(page.url())).toContain(`path=daily/${today}-02.md`);

    // A daily draft starts with daily-only fields; post-only arrays are not shown.
    await expect(page.getByText('hideHomeTitle', { exact: true })).toBeVisible();
    await expect(page.getByText('category', { exact: true })).toBeVisible();
    await expect(page.getByText('categories', { exact: true })).toHaveCount(0);
    await expect(page.getByText('keywords', { exact: true })).toHaveCount(0);
  });
});
