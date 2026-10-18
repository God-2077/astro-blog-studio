import { type APIRequestContext, expect, type Page, request, test } from '@playwright/test';

const token = process.env.GITHUB_TEST_TOKEN;
const slug = process.env.GITHUB_TEST_REPO ?? 'God-2077/astro-blog-content-test';
const branch = process.env.GITHUB_TEST_BRANCH ?? 'main';
const password = process.env.E2E_PASSWORD ?? 'studio-e2e-password';
const [owner, name] = slug.split('/');
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const dir = `src/_e2e/${runId}`;
const filePath = `${dir}/new-post.md`;

function apiHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${token ?? ''}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function api(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: 'https://api.github.com', extraHTTPHeaders: apiHeaders() });
}

async function branchHead(apiContext: APIRequestContext): Promise<string> {
  const response = await apiContext.get(`/repos/${owner}/${name}/git/ref/heads/${branch}`);
  expect(response.ok(), await response.text()).toBe(true);
  const data = (await response.json()) as { object: { sha: string } };
  return data.object.sha;
}

async function unlock(page: Page): Promise<void> {
  await page.goto('/');
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
}

test.describe('live new-post flow', () => {
  test.skip(!token, 'GITHUB_TEST_TOKEN is required for the live E2E project');

  test.afterAll(async () => {
    if (!token) return;
    const apiContext = await api();
    const current = await apiContext.get(`/repos/${owner}/${name}/contents/${filePath}?ref=${branch}`);
    if (current.ok()) {
      const data = (await current.json()) as { sha: string };
      await apiContext.delete(`/repos/${owner}/${name}/contents/${filePath}`, {
        data: { message: `test: e2e new-post cleanup ${runId}`, sha: data.sha, branch },
      });
    }
    await apiContext.dispose();
  });

  test('dashboard summarizes the recent list with one GraphQL batch', async ({ page }) => {
    const requests: Array<{ url: string; method: string }> = [];
    page.on('request', (request) => {
      if (request.url().startsWith('https://api.github.com')) {
        requests.push({ url: request.url(), method: request.method() });
      }
    });

    await unlock(page);
    await expect(page.locator('.abs-sheet').filter({ hasText: '最近动过' }).locator('ul button').first()).toBeVisible({
      timeout: 30_000,
    });

    const graphql = requests.filter((request) => request.url.endsWith('/graphql'));
    const contents = requests.filter((request) => /\/contents\//.test(request.url));
    expect(graphql).toHaveLength(1);
    expect(contents).toHaveLength(0);
  });

  test('does not create the file until the first save, then creates it in one commit', async ({ page }) => {
    await unlock(page);
    await page.getByRole('button', { name: '新建文章' }).first().click();
    const dialog = page.getByRole('dialog');
    const inputs = dialog.locator('input.abs-input');
    await inputs.nth(0).fill(`E2E 新建 ${runId}`);
    await inputs.nth(1).fill(dir);
    await inputs.nth(2).fill('new-post.md');
    await dialog.getByRole('button', { name: '开始起草' }).click();

    await expect(page).toHaveURL(/new=1/);
    await expect(page.getByText('未提交').first()).toBeVisible();
    await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 30_000 });

    const apiContext = await api();
    const beforeHead = await branchHead(apiContext);
    const before = await apiContext.get(`/repos/${owner}/${name}/contents/${filePath}?ref=${branch}`);
    expect(before.status(), 'draft must not create a remote file').toBe(404);

    const frontmatter = page.locator('section.abs-paper').filter({ hasText: 'FRONTMATTER' });
    await frontmatter.locator('input.abs-input').first().fill(`E2E 新建（live）${runId}`);
    await page.locator('.abs-stamp').click();
    await expect(page.getByRole('button', { name: '确认创建' })).toBeVisible();
    await page.getByRole('button', { name: '确认创建' }).click();
    await expect(page.getByText('已创建并提交 · 1 个提交')).toBeVisible({ timeout: 30_000 });

    const after = await apiContext.get(`/repos/${owner}/${name}/contents/${filePath}?ref=${branch}`);
    expect(after.status(), await after.text()).toBe(200);
    const afterHead = await branchHead(apiContext);
    expect(afterHead).not.toBe(beforeHead);
    const commit = await apiContext.get(`/repos/${owner}/${name}/git/commits/${afterHead}`);
    const commitData = (await commit.json()) as {
      message: string;
      parents: Array<{ sha: string }>;
    };
    expect(commitData.parents[0]?.sha).toBe(beforeHead);
    expect(commitData.message).toContain('create:');

    await apiContext.dispose();
  });
});
