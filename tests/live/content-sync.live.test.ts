import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContentStorage } from '@/lib/content/storage';
import { syncContent } from '@/lib/content/sync';
import { LiveGateway } from '@/lib/github/live';
import { INDEX_CHUNK_SIZE, MAX_INDEX_FILES, planIndex } from '@/lib/posts/summary';
import { buildTreeModel } from '@/lib/tree/model';
import { createTestOctokit, readTestEnv, redact, type TestEnv } from '../../scripts/lib/test-env';

const env = readTestEnv(false);
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const createdPath = `src/_e2e/${runId}/content-sync.md`;
const treeConfig = { rootDir: 'src', extensions: ['.md', '.mdx'], excludes: [] };

let context: TestEnv;
let gateway: LiveGateway;

async function cleanup(): Promise<void> {
  if (!context) return;
  const octokit = createTestOctokit(context.token);
  try {
    const current = await octokit.repos.getContent({
      owner: context.owner,
      repo: context.name,
      path: createdPath,
      ref: context.branch,
    });
    if (!Array.isArray(current.data) && current.data.type === 'file') {
      await octokit.repos.deleteFile({
        owner: context.owner,
        repo: context.name,
        path: createdPath,
        message: `test: content sync cleanup ${runId}`,
        sha: current.data.sha,
        branch: context.branch,
      });
    }
  } catch (error) {
    console.warn('[live content-sync cleanup]', redact(error));
  }
}

describe.skipIf(!env)('local content cache against the real repository', () => {
  beforeAll(() => {
    context = env as TestEnv;
    gateway = new LiveGateway({
      token: context.token,
      owner: context.owner,
      name: context.name,
      branch: context.branch,
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it('full-loads once, then only fetches the tree and the changed blob', async () => {
    const repoKey = `live:${context.owner}/${context.name}@${context.branch}`;
    const storage = createContentStorage(repoKey, 'demo');
    const calls: string[][] = [];
    const readFiles = async (paths: string[]) => {
      calls.push(paths);
      return gateway.readFiles(paths);
    };

    const tree = await gateway.getTree();
    const model = buildTreeModel(tree.entries, treeConfig);
    const plan = planIndex(model.files, INDEX_CHUNK_SIZE, MAX_INDEX_FILES);
    expect(plan.indexed).toBeGreaterThan(0);

    const first = await syncContent({
      storage,
      repoKey,
      signature: 'live-test',
      targets: plan.chunks.flat(),
      treeSha: tree.sha,
      truncated: tree.truncated,
      forceFull: false,
      readFiles,
      concurrency: 2,
    });

    expect(first.ok).toBe(true);
    expect(first.mode).toBe('full');
    expect(first.meta?.files).toHaveLength(plan.indexed);
    expect(calls.length).toBe(Math.ceil(plan.indexed / INDEX_CHUNK_SIZE));
    const snapshot = await storage.load();
    expect(snapshot?.files.size).toBe(plan.indexed);
    for (const file of snapshot?.files.values() ?? []) {
      expect(file.text.length).toBeGreaterThan(0);
      expect(file.sha).toBeTruthy();
    }

    const callsBefore = calls.length;
    const second = await syncContent({
      storage,
      repoKey,
      signature: 'live-test',
      targets: plan.chunks.flat(),
      treeSha: tree.sha,
      truncated: tree.truncated,
      forceFull: false,
      readFiles,
      concurrency: 2,
    });
    expect(second.mode).toBe('unchanged');
    expect(calls.length).toBe(callsBefore);

    // Add one article through the real API: the next check must read only it.
    await gateway.writeFile({
      path: createdPath,
      text: `---\ntitle: '内容缓存 live 测试'\ndate: '2026-01-01'\n---\n只应该被读取一次。\n`,
      message: `test: content sync create ${runId}`,
      branch: context.branch,
    });

    const nextTree = await gateway.getTree();
    const nextModel = buildTreeModel(nextTree.entries, treeConfig);
    const nextPlan = planIndex(nextModel.files, INDEX_CHUNK_SIZE, MAX_INDEX_FILES);
    const third = await syncContent({
      storage,
      repoKey,
      signature: 'live-test',
      targets: nextPlan.chunks.flat(),
      treeSha: nextTree.sha,
      truncated: nextTree.truncated,
      forceFull: false,
      readFiles,
      concurrency: 2,
    });

    expect(third.mode).toBe('delta');
    expect(third.ok).toBe(true);
    expect(third.counts.added).toBe(1);
    expect(calls.length).toBe(callsBefore + 1);
    expect(calls.at(-1)).toEqual([createdPath]);
    expect(third.meta?.files.map((file) => file.path)).toContain(createdPath);
  }, 60_000);
});
