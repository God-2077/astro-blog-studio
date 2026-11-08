import { expect, type Page, type Route, test } from '@playwright/test';

const password = process.env.E2E_PASSWORD ?? 'studio-e2e-password';
const repoA = 'mock-owner/repo-a';
const repoB = 'mock-owner/repo-b';
const repoRoot = 'mock-owner/repo-root';

type MockFile = { path: string; sha: string; text: string };

const files: Record<string, MockFile[]> = {
  [repoA]: [
    {
      path: 'src/content/blog/a.md',
      sha: 'blob-a',
      text: "---\ntitle: 'A 文章'\ndate: '2026-01-01'\n---\n仓库 A 的正文\n",
    },
    {
      path: 'src/notes/plain.txt',
      sha: 'blob-plain',
      text: "---\ntitle: 'not frontmatter'\n---\n\nplain body\n",
    },
  ],
  [repoB]: [
    {
      path: 'content-b/blog/b.md',
      sha: 'blob-b',
      text: "---\ntitle: 'B 文章'\ndate: '2026-01-02'\n---\n仓库 B 的正文\n",
    },
  ],
  // Root-level article plus folders: with rootDir '/' the tree must keep the
  // blog post that sits directly in the repository root.
  [repoRoot]: [
    {
      path: 'abc.md',
      sha: 'blob-root',
      text: "---\ntitle: '根目录笔记'\ndate: '2026-01-03'\n---\n根目录正文\n",
    },
    {
      path: 'notes/deep/x.md',
      sha: 'blob-note',
      text: "---\ntitle: '深层笔记'\ndate: '2026-01-04'\n---\n深层正文\n",
    },
    {
      path: 'src/legacy/y.md',
      sha: 'blob-legacy',
      text: "---\ntitle: '旧稿'\ndate: '2026-01-05'\n---\n旧稿正文\n",
    },
  ],
};

interface RepoMockState {
  patA: string;
  patB: string;
  authSeen: Map<string, Set<string>>;
  graphqlCalls: Map<string, number>;
}

async function answerConfirm(page: Page, label: string): Promise<void> {
  const confirm = page.locator('[data-abs-confirm]').last();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: label }).click();
  await expect(confirm).toBeHidden();
}

function apiHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization, x-github-api-version, content-type, accept',
    'access-control-expose-headers': 'x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset',
    'content-type': 'application/json',
  };
}

function noteAuth(state: RepoMockState, slug: string, authorization: string): void {
  const seen = state.authSeen.get(slug) ?? new Set<string>();
  seen.add(authorization);
  state.authSeen.set(slug, seen);
}

function installGitHubMock(state: RepoMockState) {
  return async (route: Route): Promise<void> => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: apiHeaders() });
      return;
    }
    const url = new URL(request.url());

    if (url.pathname === '/graphql') {
      let variables: Record<string, string> = {};
      try {
        const body = request.postDataJSON() as { variables?: Record<string, string> };
        variables = body.variables ?? {};
      } catch {
        // Malformed GraphQL bodies simply produce no files.
      }
      const slug = `${variables.owner ?? ''}/${variables.name ?? ''}`;
      noteAuth(state, slug, request.headers().authorization ?? '');
      state.graphqlCalls.set(slug, (state.graphqlCalls.get(slug) ?? 0) + 1);
      const repoFiles = files[slug] ?? [];
      const repository: Record<string, { oid: string; byteSize: number; text: string } | null> = {};
      for (const [key, expression] of Object.entries(variables)) {
        const alias = /^e(\d+)$/.exec(key);
        if (!alias) continue;
        const path = expression.slice(expression.indexOf(':') + 1);
        const file = repoFiles.find((entry) => entry.path === path);
        repository[`f${alias[1]}`] = file ? { oid: file.sha, byteSize: file.text.length, text: file.text } : null;
      }
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({ data: { repository } }),
      });
      return;
    }

    const match = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!match) {
      await route.fulfill({ status: 404, headers: apiHeaders(), body: JSON.stringify({ message: 'Not Found' }) });
      return;
    }
    const [, owner = '', name = '', rest = ''] = match;
    const slug = `${owner}/${name}`;
    noteAuth(state, slug, request.headers().authorization ?? '');

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
      const repoFiles = files[slug] ?? [];
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({
          sha: `tree-${name}`,
          tree: repoFiles.map((file) => ({ path: file.path, type: 'blob', sha: file.sha, size: file.text.length })),
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

test.describe('multiple repositories (mocked GitHub)', () => {
  test('uses each repository PAT, keeps caches separate, and does not re-read after switching back', async ({ page }) => {
    const state: RepoMockState = {
      patA: 'pat-a',
      patB: 'pat-b',
      authSeen: new Map(),
      graphqlCalls: new Map(),
    };
    await page.route('https://api.github.com/**', installGitHubMock(state));

    await page.goto('/');
    await expect(page).toHaveURL(/#\/setup/, { timeout: 30_000 });

    await page.locator('input[placeholder="github_pat_…"]').fill(state.patA);
    await page.locator('input[placeholder*="God-2077"]').fill(repoA);
    await page.getByRole('radio', { name: '密码', exact: true }).check();
    await page.locator('input[placeholder="设置一个密码"]').fill(password);
    await page.getByRole('button', { name: /连接仓库/ }).click();
    await expect(page.getByText('今天写点什么？')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('A 文章')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => state.graphqlCalls.get(repoA) ?? 0).toBe(1);

    await page.locator('.abs-topbar').getByRole('link', { name: '设置', exact: true }).click();
    await expect(page.locator('section.abs-paper').filter({ hasText: '独立 PAT' })).toHaveCount(1);

    const rootDirInput = (): ReturnType<typeof page.locator> =>
      page.locator('label.abs-field').filter({ hasText: '根目录' }).locator('input');
    const createInput = (): ReturnType<typeof page.locator> =>
      page.locator('label.abs-field').filter({ hasText: 'create' }).locator('input');

    // Repository A keeps rootDir=src (so its article cache stays valid) but gets
    // a distinctive commit template.
    await createInput().fill('a: {title}');
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.getByText('设置已保存').last()).toBeVisible();

    // Add repository B with its own PAT and content root.
    await page.getByRole('button', { name: '添加仓库' }).click();
    const addDialog = page.getByRole('dialog');
    await addDialog.getByRole('textbox', { name: /^仓库 / }).fill(repoB);
    await addDialog.locator('input[type="password"]').fill(state.patB);
    await addDialog.getByRole('textbox', { name: /^根目录 / }).fill('content-b');
    await addDialog.getByRole('button', { name: '校验并添加' }).click();
    await expect(page.getByText('已添加并切换仓库')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.abs-topbar')).toContainText(repoB);
    await expect(rootDirInput()).toHaveValue('content-b');
    // B starts from A's stored commit template; make it distinct.
    await expect(createInput()).toHaveValue('a: {title}');
    await createInput().fill('b: {title}');
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.getByText('设置已保存').last()).toBeVisible();
    await expect.poll(() => state.graphqlCalls.get(repoB) ?? 0).toBe(1);

    // Switch back to A and confirm its configuration, not B's.
    const repoSection = page.locator('section.abs-paper').filter({ hasText: '独立 PAT' });
    const rowA = repoSection.locator('li').filter({ hasText: 'repo-a' });
    await rowA.getByRole('button', { name: '切换' }).click();
    await expect(page.locator('.abs-topbar')).toContainText(repoA);
    await expect(rootDirInput()).toHaveValue('src');
    await expect(createInput()).toHaveValue('a: {title}');

    // The dashboard is served from A's encrypted cache; no second GraphQL read.
    await page.locator('.abs-brand').click();
    await expect(page.getByText('A 文章')).toBeVisible({ timeout: 30_000 });
    // The title can appear from IndexedDB before the HEAD reconciliation
    // settles; give the unchanged path time to finish before asserting reads.
    await page.waitForTimeout(300);
    expect(state.graphqlCalls.get(repoA)).toBe(1);
    expect(state.graphqlCalls.get(repoB)).toBe(1);

    // The tree requests prove each repository used its own PAT.
    const authA = state.authSeen.get(repoA) ?? new Set<string>();
    const authB = state.authSeen.get(repoB) ?? new Set<string>();
    expect(authA.has(`token ${state.patA}`)).toBe(true);
    expect(authB.has(`token ${state.patB}`)).toBe(true);
    expect(authA.has(`token ${state.patB}`)).toBe(false);
    expect(authB.has(`token ${state.patA}`)).toBe(false);

    // Locking clears all PATs from memory; one password unlock restores both.
    await page.locator('.abs-topbar').getByRole('button', { name: '锁定', exact: true }).click();
    await expect(page).toHaveURL(/#\/unlock/, { timeout: 15_000 });
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /揭开封印/ }).click();
    await expect(page.getByText('今天写点什么？')).toBeVisible({ timeout: 30_000 });

    await page.locator('.abs-topbar').getByRole('link', { name: '设置', exact: true }).click();
    const rowB = page.locator('section.abs-paper').filter({ hasText: '独立 PAT' }).locator('li').filter({ hasText: 'repo-b' });
    await rowB.getByRole('button', { name: '切换' }).click();
    await expect(page.locator('.abs-topbar')).toContainText(repoB);
    await expect(rootDirInput()).toHaveValue('content-b');
    await expect(createInput()).toHaveValue('b: {title}');
    expect((state.authSeen.get(repoB) ?? new Set<string>()).has(`token ${state.patB}`)).toBe(true);

    // Updating the token re-encrypts it and makes the next request use it.
    const newPatB = 'pat-b-updated';
    await rowB.getByRole('button', { name: '更新令牌' }).click();
    const tokenDialog = page.getByRole('dialog');
    await tokenDialog.locator('input[type="password"]').fill(newPatB);
    await tokenDialog.getByRole('button', { name: '校验并更新' }).click();
    await expect(page.getByText(/已更新 mock-owner\/repo-b 的令牌/)).toBeVisible();
    await expect
      .poll(() => [...(state.authSeen.get(repoB) ?? new Set<string>())].some((value) => value.includes(newPatB)))
      .toBe(true);

    // Removing the inactive A profile cleans its repository row.
    await rowA.getByRole('button', { name: '移除' }).click();
    await answerConfirm(page, '移除仓库');
    await expect(page.getByText('已移除仓库')).toBeVisible();
    await expect(rowA).toHaveCount(0);
  });
});

test.describe('plain text files (mocked GitHub)', () => {
  test('opens configured non-Markdown files without frontmatter, preview, or mode switch', async ({ page }) => {
    const state: RepoMockState = {
      patA: 'pat-plain',
      patB: '',
      authSeen: new Map(),
      graphqlCalls: new Map(),
    };
    await page.route('https://api.github.com/**', installGitHubMock(state));

    await page.goto('/');
    await expect(page).toHaveURL(/#\/setup/, { timeout: 30_000 });
    await page.locator('input[placeholder="github_pat_…"]').fill(state.patA);
    await page.locator('input[placeholder*="God-2077"]').fill(repoA);
    await page.getByRole('radio', { name: '密码', exact: true }).check();
    await page.locator('input[placeholder="设置一个密码"]').fill(password);
    await page.getByRole('button', { name: /连接仓库/ }).click();
    await expect(page.getByText('今天写点什么？')).toBeVisible({ timeout: 30_000 });

    await page.locator('.abs-topbar').getByRole('link', { name: '设置', exact: true }).click();
    const extensions = page.locator('label.abs-field').filter({ hasText: '文件扩展名' }).locator('input');
    await extensions.fill('.md, .mdx, .txt');
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.getByText('设置已保存').last()).toBeVisible();

    await page.locator('.abs-brand').click();
    const tree = page.locator('aside');
    const plain = tree.getByRole('button', { name: 'plain.txt', exact: true });
    await expect(plain).toBeVisible({ timeout: 30_000 });
    await plain.click();

    await expect(page).toHaveURL(/plain\.txt/);
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('plain · 纯文本')).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText("title: 'not frontmatter'");
    await expect(page.locator('.cm-content')).toContainText('plain body');

    // No frontmatter paper, preview column, or form/source switch.
    await expect(page.getByText('frontmatter', { exact: true })).toHaveCount(0);
    await expect(page.locator('.abs-preview')).toHaveCount(0);
    await expect(page.getByText('预览 · 实时')).toHaveCount(0);
    await expect(page.locator('.abs-seg')).toHaveCount(0);
    await expect(page.locator('.abs-field').filter({ hasText: 'title' })).toHaveCount(0);
  });
});

test.describe('content root at the repository root (mocked GitHub)', () => {
  test('keeps a root-level article in the index card when the content root is /', async ({ page }) => {
    const state: RepoMockState = {
      patA: 'pat-root',
      patB: '',
      authSeen: new Map(),
      graphqlCalls: new Map(),
    };
    await page.route('https://api.github.com/**', installGitHubMock(state));

    await page.goto('/');
    await expect(page).toHaveURL(/#\/setup/, { timeout: 30_000 });

    await page.locator('input[placeholder="github_pat_…"]').fill(state.patA);
    await page.locator('input[placeholder*="God-2077"]').fill(repoRoot);
    await page.locator('label.abs-field').filter({ hasText: '文章根目录' }).locator('input').fill('/');
    await page.getByRole('radio', { name: '密码', exact: true }).check();
    await page.locator('input[placeholder="设置一个密码"]').fill(password);
    await page.getByRole('button', { name: /连接仓库/ }).click();
    await expect(page.getByText('今天写点什么？')).toBeVisible({ timeout: 30_000 });

    // The index card lists the root-level post next to its folders.
    const tree = page.locator('aside');
    // The cache card in the same aside also reports "3 篇"; scope the count to the index card header.
    const indexCard = tree.locator('.abs-paper').filter({ hasText: '索引卡' });
    await expect(indexCard.getByText('3 篇')).toBeVisible({ timeout: 30_000 });
    await expect(tree.getByRole('button', { name: 'abc.md', exact: true })).toBeVisible();
    await expect(tree.getByRole('button', { name: /^notes/ })).toBeVisible();
    await expect(tree.getByRole('button', { name: /^src/ })).toBeVisible();
    await expect(page.locator('main').getByText('根目录笔记')).toBeVisible({ timeout: 30_000 });

    // The post opens in the editor with its own content.
    await tree.getByRole('button', { name: 'abc.md', exact: true }).click();
    await expect(page).toHaveURL(/#\/edit\?path=abc\.md/, { timeout: 30_000 });
    await expect(page.locator('.abs-field').filter({ hasText: 'title' }).locator('input')).toHaveValue('根目录笔记');
    await expect(page.locator('.abs-preview')).toContainText('根目录正文');
  });
});
