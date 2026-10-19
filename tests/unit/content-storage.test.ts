import 'fake-indexeddb/auto';
import { createStore, entries, get, set } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ContentFile, ContentMeta } from '@/lib/content/model';
import { contentMetaKey } from '@/lib/content/model';
import { clearAllContent, clearContentByPrefix, createContentStorage, dropContentMemory } from '@/lib/content/storage';
import { randomBytes } from '@/lib/vault/crypto';
import { vaultSession } from '@/lib/vault/session';
import { useVault } from '@/stores/vault';

const repoKey = 'live:God-2077/astro-blog-content-test@main';
const store = createStore('abs-content', 'records');

async function rawFileRows(): Promise<Array<[string, unknown]>> {
  const rows = await entries(store);
  return rows.map(([key, value]): [string, unknown] => [String(key), value]).filter(([key]) => key.startsWith('file\u0000'));
}

async function rawMetaRows(): Promise<Array<[string, unknown]>> {
  const rows = await entries(store);
  return rows.map(([key, value]): [string, unknown] => [String(key), value]).filter(([key]) => key.startsWith('meta\u0000'));
}

function makeFile(
  path = 'src/content/blog/post/hello-world.md',
  sha = 'sha-a',
  text = "---\ntitle: '秘密标题'\ndate: '2026-01-01'\n---\n正文内容\n",
): ContentFile {
  return { path, sha, text, size: text.length };
}

function makeMeta(file: ContentFile, overrides: Partial<ContentMeta> = {}): ContentMeta {
  return {
    version: 1,
    repoKey,
    signature: 'src\u0000.md,.mdx\u0000',
    treeSha: 'tree-sha',
    savedAt: 1_700_000_000_000,
    files: [{ path: file.path, sha: file.sha, chars: file.text.length }],
    ...overrides,
  };
}

beforeEach(async () => {
  vaultSession.set('test-token', randomBytes(32));
  await clearAllContent();
});

afterEach(() => {
  vaultSession.clear();
  dropContentMemory();
});

describe('content storage (live)', () => {
  it('round-trips encrypted articles and never writes plaintext to IndexedDB', async () => {
    const storage = createContentStorage(repoKey, 'live');
    const file = makeFile();
    const meta = makeMeta(file);

    expect(await storage.saveFiles([file])).toBe('saved');
    expect(await storage.saveMeta(meta)).toBe('saved');

    const rawFiles = await rawFileRows();
    const rawMeta = await rawMetaRows();
    const serialized = JSON.stringify([rawFiles, rawMeta]);
    expect(serialized).not.toContain('秘密标题');
    expect(serialized).not.toContain('正文内容');
    expect(rawFiles).toHaveLength(1);
    expect(rawMeta).toHaveLength(1);
    const envelope = rawFiles[0]?.[1] as { v?: number; alg?: string; ciphertext?: string; size?: number };
    expect(envelope.v).toBe(1);
    expect(envelope.alg).toBe('AES-GCM');
    expect(typeof envelope.ciphertext).toBe('string');
    expect(envelope.size).toBeGreaterThan(0);

    dropContentMemory();
    const snapshot = await storage.load();
    expect(snapshot?.meta.treeSha).toBe('tree-sha');
    expect(snapshot?.meta.files).toHaveLength(1);
    expect(snapshot?.files.get(file.path)?.text).toBe(file.text);
  });

  it('reports locked instead of falling back to plaintext', async () => {
    const storage = createContentStorage(repoKey, 'live');
    const file = makeFile();
    vaultSession.clear();

    expect(await storage.load()).toBeNull();
    expect(await storage.saveFiles([file])).toBe('locked');
    expect(await storage.saveMeta(makeMeta(file))).toBe('locked');
    expect(await rawFileRows()).toHaveLength(0);
  });

  it('rejects a tampered meta record', async () => {
    const storage = createContentStorage(repoKey, 'live');
    const file = makeFile();
    expect(await storage.saveFiles([file])).toBe('saved');
    expect(await storage.saveMeta(makeMeta(file))).toBe('saved');

    const raw = await get(contentMetaKey(repoKey), store);
    await set(contentMetaKey(repoKey), { ...(raw as Record<string, unknown>), ciphertext: 'AAAA' }, store);
    dropContentMemory();

    expect(await storage.load()).toBeNull();
  });

  it('clears only the requested repo prefix', async () => {
    const live = createContentStorage(repoKey, 'live');
    const devKey = 'live:other/repo@dev';
    const dev = createContentStorage(devKey, 'live');
    const file = makeFile();
    const devFile = makeFile('src/dev.md', 'sha-dev');

    expect(await live.saveFiles([file])).toBe('saved');
    expect(await live.saveMeta(makeMeta(file))).toBe('saved');
    expect(await dev.saveFiles([devFile])).toBe('saved');
    expect(await dev.saveMeta(makeMeta(devFile, { repoKey: devKey, treeSha: 'dev-tree' }))).toBe('saved');

    expect(await clearContentByPrefix('live:other/')).toBe(true);
    dropContentMemory();
    expect(await dev.load()).toBeNull();
    expect((await live.load())?.files.get(file.path)?.text).toBe(file.text);
  });

  it('wipes live article rows when the vault is reset', async () => {
    const storage = createContentStorage(repoKey, 'live');
    const file = makeFile();
    expect(await storage.saveFiles([file])).toBe('saved');
    expect(await storage.saveMeta(makeMeta(file))).toBe('saved');
    expect(await rawFileRows()).toHaveLength(1);
    expect(await rawMetaRows()).toHaveLength(1);

    await useVault.getState().reset();

    expect(await rawFileRows()).toHaveLength(0);
    expect(await rawMetaRows()).toHaveLength(0);
  });
});

describe('content storage (demo)', () => {
  it('keeps demo articles in memory and never touches IndexedDB', async () => {
    vaultSession.clear();
    const demoKey = 'demo:God-2077/astro-blog-content-test@main';
    const demo = createContentStorage(demoKey, 'demo');
    const file = makeFile();

    expect(await demo.saveFiles([file])).toBe('saved');
    expect(await demo.saveMeta(makeMeta(file, { repoKey: demoKey }))).toBe('saved');
    expect(await rawFileRows()).toHaveLength(0);
    expect(await rawMetaRows()).toHaveLength(0);

    const snapshot = await demo.load();
    expect(snapshot?.files.get(file.path)?.text).toBe(file.text);
    expect(await demo.clear()).toBe(true);
    expect(await demo.load()).toBeNull();
  });
});
