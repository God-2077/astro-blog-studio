import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@/lib/github/errors';
import { LiveGateway } from '@/lib/github/live';
import { parseDocument } from '@/lib/markdown/document';
import { createTestOctokit, readTestEnv, redact, type TestEnv } from '../../scripts/lib/test-env';

const env = readTestEnv(false);
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const dir = `src/_e2e/${runId}`;
const createdPaths = new Set<string>();

let gateway: LiveGateway;
let context: TestEnv;

function path(name: string): string {
  const target = `${dir}/${name}`;
  createdPaths.add(target);
  return target;
}

async function cleanup(): Promise<void> {
  if (!context) return;
  const octokit = createTestOctokit(context.token);
  try {
    const ref = await octokit.request('GET /repos/{owner}/{repo}/git/ref/heads/{branch}', {
      owner: context.owner,
      repo: context.name,
      branch: context.branch,
    });
    const commit = await octokit.request('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
      owner: context.owner,
      repo: context.name,
      commit_sha: ref.data.object.sha,
    });
    const tree = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
      owner: context.owner,
      repo: context.name,
      tree_sha: commit.data.tree.sha,
      recursive: '1',
    });
    for (const item of tree.data.tree) {
      if (item.type !== 'blob' || !item.path?.startsWith('src/_e2e/')) continue;
      const contents = await octokit.repos.getContent({
        owner: context.owner,
        repo: context.name,
        path: item.path,
        ref: context.branch,
      });
      if (Array.isArray(contents.data) || contents.data.type !== 'file') continue;
      await octokit.repos.deleteFile({
        owner: context.owner,
        repo: context.name,
        path: item.path,
        message: `test: cleanup ${item.path}`,
        sha: contents.data.sha,
        branch: context.branch,
      });
    }
  } catch (error) {
    console.warn('[live cleanup]', redact(error));
  }
}

describe.skipIf(!env)('LiveGateway against the test repository', () => {
  beforeAll(async () => {
    context = env as TestEnv;
    gateway = new LiveGateway({
      token: context.token,
      owner: context.owner,
      name: context.name,
      branch: context.branch,
    });
    const tree = await gateway.getTree();
    const hasSeed = tree.entries.some((entry) => entry.path === 'src/content/blog/note/便笺-测试.md');
    if (!hasSeed) throw new Error('seed files are missing; run `pnpm test:seed` first');
  });

  afterAll(async () => {
    await cleanup();
  });

  it('reads repo info and the test branch', async () => {
    const repo = await gateway.getRepo();
    expect(repo.canPush).toBe(true);
    expect(repo.defaultBranch).toBe(context.branch);
  });

  it('preserves CRLF in the seed file and in a newly written file', async () => {
    const seed = await gateway.readFile('src/content/blog/note/便笺-测试.md');
    expect(seed.text.includes('\r\n')).toBe(true);
    expect(parseDocument(seed.text).meta.eol).toBe('\r\n');

    const target = path('crlf.md');
    const text = "---\r\ntitle: 'CRLF'\r\ndate: '2026-01-01 00:00:00'\r\n---\r\n\r\nfirst line\r\nsecond line\r\n";
    createdPaths.add(target);
    await gateway.writeFile({ path: target, text, message: `test: crlf ${runId}`, branch: context.branch });
    const read = await gateway.readFile(target);
    expect(read.text).toBe(text);
    expect(read.text.includes('\r\n')).toBe(true);
  });

  it('reads multiple files in one batch, including CJK paths', async () => {
    const files = await gateway.readFiles([
      'src/content/blog/post/hello-world.md',
      'src/content/blog/note/便笺-测试.md',
      'src/pages/about.md',
      'src/content/blog/note/missing.md',
    ]);
    expect(files).toHaveLength(3);
    const note = files.find((file) => file.path === 'src/content/blog/note/便笺-测试.md');
    expect(note?.text).toContain('便笺：测试');
    expect(note?.sha).toMatch(/^[a-f0-9]{40}$/);
    expect(files.some((file) => file.path.endsWith('missing.md'))).toBe(false);
  });

  it('creates, updates, detects a stale sha, and deletes', async () => {
    const target = path('便笺-新建.md');
    const created = await gateway.writeFile({
      path: target,
      text: "---\ntitle: '新建'\ndate: '2026-01-01 00:00:00'\n---\n\nv1\n",
      message: `test: create ${runId}`,
      branch: context.branch,
    });
    expect(created.sha).toBeTruthy();
    const first = await gateway.readFile(target);
    expect(first.text).toContain('v1');

    await gateway.writeFile({
      path: target,
      text: "---\ntitle: '新建'\ndate: '2026-01-01 00:00:00'\n---\n\nv2\n",
      message: `test: update ${runId}`,
      branch: context.branch,
      sha: first.sha,
    });
    const second = await gateway.readFile(target);
    expect(second.text).toContain('v2');
    expect(second.sha).not.toBe(first.sha);

    await expect(
      gateway.writeFile({
        path: target,
        text: 'stale',
        message: `test: stale ${runId}`,
        branch: context.branch,
        sha: first.sha,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await gateway.deleteFile({ path: target, message: `test: delete ${runId}`, branch: context.branch, sha: second.sha });
    await expect(gateway.readFile(target)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('moves a file with a single commit', async () => {
    const from = path('move.md');
    const to = `${dir}/sub/moved-便笺.md`;
    createdPaths.add(to);
    await gateway.writeFile({
      path: from,
      text: "---\ntitle: 'move'\ndate: '2026-01-01 00:00:00'\n---\n\nmove me\n",
      message: `test: create move ${runId}`,
      branch: context.branch,
    });
    const current = await gateway.readFile(from);

    const octokit = createTestOctokit(context.token);
    const before = await octokit.request('GET /repos/{owner}/{repo}/git/ref/heads/{branch}', {
      owner: context.owner,
      repo: context.name,
      branch: context.branch,
    });
    await gateway.moveFile({
      from,
      to,
      text: current.text,
      message: `test: move ${runId}`,
      branch: context.branch,
      sha: current.sha,
    });
    const after = await octokit.request('GET /repos/{owner}/{repo}/git/ref/heads/{branch}', {
      owner: context.owner,
      repo: context.name,
      branch: context.branch,
    });
    expect(after.data.object.sha).not.toBe(before.data.object.sha);
    const commit = await octokit.request('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
      owner: context.owner,
      repo: context.name,
      commit_sha: after.data.object.sha,
    });
    expect(commit.data.parents[0]?.sha).toBe(before.data.object.sha);
    expect(commit.data.message).toContain(runId);

    await expect(gateway.readFile(from)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await gateway.readFile(to)).text).toContain('move me');
  });

  it('fails a stale move instead of overwriting', async () => {
    const from = path('stale-move.md');
    const to = `${dir}/stale-target.md`;
    createdPaths.add(to);
    await gateway.writeFile({
      path: from,
      text: "---\ntitle: 'stale'\ndate: '2026-01-01 00:00:00'\n---\n\nstale\n",
      message: `test: stale move ${runId}`,
      branch: context.branch,
    });
    const current = await gateway.readFile(from);
    await gateway.writeFile({
      path: from,
      text: "---\ntitle: 'stale'\ndate: '2026-01-01 00:00:00'\n---\n\nremote change\n",
      message: `test: remote change ${runId}`,
      branch: context.branch,
      sha: current.sha,
    });
    await expect(
      gateway.moveFile({
        from,
        to,
        text: current.text,
        message: `test: stale move ${runId}`,
        branch: context.branch,
        sha: current.sha,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('maps a missing file and invalid token to typed errors', async () => {
    await expect(gateway.readFile(`${dir}/missing.md`)).rejects.toBeInstanceOf(AppError);
    const bad = new LiveGateway({
      token: 'ghp_invalid_token_for_live_test',
      owner: context.owner,
      name: context.name,
      branch: context.branch,
    });
    await expect(bad.getRepo()).rejects.toMatchObject({ code: 'AUTH_INVALID' });
  });
});
