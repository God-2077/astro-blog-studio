import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ContentTarget } from '@/lib/content/model';
import { clearAllContent } from '@/lib/content/storage';
import type { FileContent } from '@/lib/github/types';
import { randomBytes } from '@/lib/vault/crypto';
import { vaultSession } from '@/lib/vault/session';
import { useContent } from '@/stores/content';

const repoA = 'live:God-2077/astro-blog-content@main';
const repoB = 'live:God-2077/astro-blog-notes@main';
const signatureA = 'src\u0000.md,.mdx\u0000';

function fileAt(path: string, sha: string, title: string): FileContent {
  const text = `---\ntitle: '${title}'\ndate: '2026-01-01'\n---\n正文\n`;
  return { path, text, sha, size: text.length };
}

const fileA = fileAt('src/content/blog/a.md', 'sha-a', 'A 仓库文章');
const fileB = fileAt('src/content/blog/b.md', 'sha-b', 'B 仓库文章');

function targets(files: FileContent[]): ContentTarget[] {
  return files.map((file) => ({ path: file.path, sha: file.sha }));
}

beforeEach(async () => {
  vaultSession.set(null, randomBytes(32));
  await clearAllContent();
  useContent.getState().reset();
});

afterEach(async () => {
  useContent.getState().reset();
  vaultSession.clear();
  await clearAllContent();
});

describe('switching repositories reuses the encrypted article cache', () => {
  it('does not re-read A after switching A -> B -> A when the tree is unchanged', async () => {
    const reads: string[][] = [];
    const readFiles = async (paths: string[]): Promise<FileContent[]> => {
      reads.push([...paths]);
      const all = [fileA, fileB];
      return paths.map((path) => all.find((file) => file.path === path)).filter((file): file is FileContent => Boolean(file));
    };

    await useContent.getState().prepare({ repoKey: repoA, signature: signatureA, kind: 'live' });
    await useContent.getState().syncWithTree({
      chunks: [targets([fileA])],
      treeSha: 'tree-a',
      truncated: false,
      readFiles,
      concurrency: 1,
      visibleTotal: 1,
      indexed: 1,
    });
    expect(reads).toHaveLength(1);
    expect(useContent.getState().cachedCount).toBe(1);

    await useContent.getState().prepare({ repoKey: repoB, signature: signatureA, kind: 'live' });
    await useContent.getState().syncWithTree({
      chunks: [targets([fileB])],
      treeSha: 'tree-b',
      truncated: false,
      readFiles,
      concurrency: 1,
      visibleTotal: 1,
      indexed: 1,
    });
    expect(reads).toHaveLength(2);

    // Switch cleanup: drop only the in-memory views, never IndexedDB.
    useContent.getState().reset();
    await useContent.getState().prepare({ repoKey: repoA, signature: signatureA, kind: 'live' });
    expect(useContent.getState().cachedCount).toBe(1);

    const result = await useContent.getState().syncWithTree({
      chunks: [targets([fileA])],
      treeSha: 'tree-a',
      truncated: false,
      readFiles,
      concurrency: 1,
      visibleTotal: 1,
      indexed: 1,
    });

    expect(result?.mode).toBe('unchanged');
    expect(reads).toHaveLength(2);
    expect(useContent.getState().status).toBe('ready');
    expect(useContent.getState().summaries.map((summary) => summary.title)).toContain('A 仓库文章');
    expect(useContent.getState().summaries.map((summary) => summary.title)).not.toContain('B 仓库文章');
  });
});
