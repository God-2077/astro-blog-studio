import { expect, type Page, type Route, test } from '@playwright/test';

const password = process.env.E2E_PASSWORD ?? 'studio-e2e-password';
const repoA = 'mock-owner/repo-a';
const repoB = 'mock-owner/repo-b';

const files: Record<string, { path: string; sha: string; text: string }> = {
  [repoA]: {
    path: 'src/content/blog/a.md',
    sha: 'blob-a',
    text: "---\ntitle: 'A 文章'\ndate: '2026-01-01'\n---\n仓库 A 的正文\n",
  },
  [repoB]: {
    path: 'content-b/blog/b.md',
    sha: 'blob-b',
    text: "---\ntitle: 'B 文章'\ndate: '2026-01-02'\n---\n仓库 B 的正文\n",
  },
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
      const file = files[slug];
      const expression = variables.e0 ?? '';
      const path = expression.slice(expression.indexOf(':') + 1);
      const blob = file?.path === path ? { oid: file.sha, byteSize: file.text.length, text: file.text } : null;
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({ data: { repository: { f0: blob } } }),
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
      const file = files[slug];
      await route.fulfill({
        status: 200,
        headers: apiHeaders(),
        body: JSON.stringify({
          sha: `tree-${name}`,
          tree: file ? [{ path: file.path, type: 'blob', sha: file.sha, size: file.text.length }] : [],
          truncated: false,
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
