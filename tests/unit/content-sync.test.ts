import { describe, expect, it } from 'vitest';
import type { ContentFile, ContentMeta, ContentSnapshot, ContentTarget } from '@/lib/content/model';
import type { ContentStorage, ContentWriteResult } from '@/lib/content/storage';
import { type SyncInput, syncContent } from '@/lib/content/sync';
import type { FileContent } from '@/lib/github/types';

interface SeedFile {
  text: string;
  sha: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function makeSeed(count: number, prefix = 'p'): Map<string, SeedFile> {
  const seed = new Map<string, SeedFile>();
  for (let index = 0; index < count; index += 1) {
    const path = `src/content/blog/post/${prefix}${String(index).padStart(3, '0')}.md`;
    seed.set(path, { text: `---\ntitle: 'T${index}'\n---\nbody ${index}\n`, sha: `sha-${index}` });
  }
  return seed;
}

function targetsOf(seed: Map<string, SeedFile>): ContentTarget[] {
  return [...seed.entries()].map(([path, file]) => ({ path, sha: file.sha })).sort((a, b) => a.path.localeCompare(b.path));
}

class FakeReader {
  calls: string[][] = [];
  active = 0;
  peak = 0;
  failPaths = new Set<string>();
  /** Requested paths the gateway returns no text for (oversized, binary, permission). */
  absentPaths = new Set<string>();
  seed: Map<string, SeedFile>;

  constructor(
    seed: Map<string, SeedFile>,
    private readonly latency = 1,
  ) {
    this.seed = seed;
  }

  async readFiles(paths: string[]): Promise<FileContent[]> {
    this.calls.push([...paths]);
    this.active += 1;
    this.peak = Math.max(this.peak, this.active);
    try {
      await delay(this.latency);
      if (paths.some((path) => this.failPaths.has(path))) throw new Error('batch down');
      const files: FileContent[] = [];
      for (const path of paths) {
        if (this.absentPaths.has(path)) continue;
        const entry = this.seed.get(path);
        if (!entry) continue;
        files.push({ path, text: entry.text, sha: entry.sha, size: entry.text.length });
      }
      return files;
    } finally {
      this.active -= 1;
    }
  }
}

class FakeStorage implements ContentStorage {
  readonly repoKey = 'live:God-2077/astro-blog-content-test@main';
  readonly kind = 'memory' as const;
  meta: ContentMeta | null = null;
  files = new Map<string, ContentFile>();
  loadCalls = 0;
  clearCalls = 0;
  removed: string[][] = [];
  saveResult: ContentWriteResult = 'saved';
  metaResult: ContentWriteResult = 'saved';

  async load(): Promise<ContentSnapshot | null> {
    this.loadCalls += 1;
    return this.meta ? { meta: this.meta, files: this.files } : null;
  }

  async saveFiles(files: ContentFile[]): Promise<ContentWriteResult> {
    if (this.saveResult === 'saved') {
      for (const file of files) this.files.set(file.path, file);
    }
    return this.saveResult;
  }

  async saveMeta(meta: ContentMeta): Promise<ContentWriteResult> {
    if (this.metaResult === 'saved') this.meta = meta;
    return this.metaResult;
  }

  async removeFiles(paths: string[]): Promise<void> {
    this.removed.push(paths);
    for (const path of paths) this.files.delete(path);
  }

  async clear(): Promise<boolean> {
    this.clearCalls += 1;
    this.meta = null;
    this.files.clear();
    return true;
  }
}

interface Harness {
  storage: FakeStorage;
  reader: FakeReader;
  input: SyncInput;
}

function makeHarness(seed: Map<string, SeedFile>, overrides: Partial<SyncInput> = {}): Harness {
  const storage = new FakeStorage();
  const reader = new FakeReader(seed);
  return {
    storage,
    reader,
    input: {
      storage,
      repoKey: storage.repoKey,
      signature: 'sig-1',
      targets: targetsOf(seed),
      treeSha: 'tree-1',
      truncated: false,
      forceFull: false,
      readFiles: (paths) => reader.readFiles(paths),
      concurrency: 2,
      ...overrides,
    },
  };
}

describe('syncContent', () => {
  it('full-loads every target in 20-file batches and persists the meta', async () => {
    const seed = makeSeed(45);
    const { storage, reader, input } = makeHarness(seed);
    const phases: string[] = [];

    const result = await syncContent({ ...input, onProgress: (progress) => phases.push(progress.phase) });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe('full');
    expect(reader.calls.map((chunk) => chunk.length)).toEqual([20, 20, 5]);
    expect(storage.files.size).toBe(45);
    expect(storage.meta?.files).toHaveLength(45);
    expect(storage.meta?.treeSha).toBe('tree-1');
    expect(storage.meta?.signature).toBe('sig-1');
    expect(phases[0]).toBe('load');
    expect(phases).toContain('fetch');
  });

  it('returns unchanged without reading a single blob when the tree sha matches', async () => {
    const seed = makeSeed(25);
    const harness = makeHarness(seed);
    await syncContent(harness.input);
    const calls = harness.reader.calls.length;

    const result = await syncContent(harness.input);

    expect(result.mode).toBe('unchanged');
    expect(result.ok).toBe(true);
    expect(harness.reader.calls.length).toBe(calls);
  });

  it('reads only added + modified blobs, removes deleted ones and updates meta', async () => {
    const seed = makeSeed(30);
    const harness = makeHarness(seed);
    await syncContent(harness.input);

    const next = new Map(seed);
    next.delete('src/content/blog/post/p000.md');
    const modified = 'src/content/blog/post/p001.md';
    next.set(modified, { text: `---\ntitle: '已更新'\n---\nnew body\n`, sha: 'sha-new' });
    const added = 'src/content/blog/post/p999.md';
    next.set(added, { text: `---\ntitle: '新增'\n---\nadded\n`, sha: 'sha-added' });
    harness.reader.seed = next;

    const before = harness.reader.calls.length;
    const result = await syncContent({
      ...harness.input,
      targets: targetsOf(next),
      treeSha: 'tree-2',
    });

    expect(result.mode).toBe('delta');
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({ added: 1, modified: 1, deleted: 1 });
    expect(harness.reader.calls.length).toBe(before + 1);
    const requested = harness.reader.calls[before] ?? [];
    expect(requested.sort()).toEqual([added, modified].sort());
    expect(harness.storage.removed).toEqual([['src/content/blog/post/p000.md']]);
    expect(harness.storage.meta?.files).toHaveLength(30);
    expect(harness.storage.files.get(modified)?.text).toContain('已更新');
  });

  it('keeps a failed batch out of meta so the next run retries it', async () => {
    const seed = makeSeed(25);
    const { storage, reader, input } = makeHarness(seed);
    const failedPath = 'src/content/blog/post/p022.md';
    reader.failPaths.add(failedPath);

    const result = await syncContent(input);
    expect(result.ok).toBe(false);
    expect(result.failedBatches).toBe(1);
    expect(storage.meta?.files.map((file) => file.path)).not.toContain(failedPath);
    expect(storage.meta?.files).toHaveLength(20);

    reader.failPaths.clear();
    const retry = await syncContent(input);
    expect(retry.ok).toBe(true);
    expect(retry.mode).toBe('delta');
    expect(retry.counts.added).toBe(5);
    expect(storage.meta?.files).toHaveLength(25);
  });

  it('counts blobs the gateway cannot return and retries them later', async () => {
    const seed = makeSeed(21);
    const missing = 'src/content/blog/post/p020.md';
    const harness = makeHarness(seed);
    harness.reader.absentPaths.add(missing);

    const result = await syncContent(harness.input);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(1);
    expect(harness.storage.meta?.files).toHaveLength(20);

    harness.reader.absentPaths.clear();
    const retry = await syncContent(harness.input);
    expect(retry.mode).toBe('delta');
    expect(retry.counts.added).toBe(1);
    expect(harness.reader.calls.at(-1)).toEqual([missing]);
    expect(harness.storage.meta?.files).toHaveLength(21);
  });

  it('clears the cache and re-reads everything on a forced full reload', async () => {
    const seed = makeSeed(25);
    const harness = makeHarness(seed);
    await syncContent(harness.input);
    const calls = harness.reader.calls.length;

    const result = await syncContent({ ...harness.input, forceFull: true });

    expect(result.mode).toBe('full');
    expect(harness.storage.clearCalls).toBe(1);
    expect(harness.reader.calls.length).toBe(calls + 2);
  });

  it('starts over when the content config signature changes', async () => {
    const seed = makeSeed(5);
    const harness = makeHarness(seed);
    await syncContent(harness.input);
    const calls = harness.reader.calls.length;

    const result = await syncContent({ ...harness.input, signature: 'sig-2' });

    expect(result.mode).toBe('full');
    expect(harness.storage.clearCalls).toBe(1);
    expect(harness.reader.calls.length).toBe(calls + 1);
  });

  it('never deletes paths when the tree is truncated', async () => {
    const seed = makeSeed(3);
    const harness = makeHarness(seed);
    await syncContent(harness.input);
    const vanished = 'src/content/blog/post/p000.md';
    const next = new Map(seed);
    next.delete(vanished);
    harness.reader.seed = next;

    const result = await syncContent({ ...harness.input, targets: targetsOf(next), treeSha: 'tree-2', truncated: true });

    expect(result.counts.deleted).toBe(1);
    expect(harness.storage.removed).toHaveLength(0);
    expect(harness.storage.files.has(vanished)).toBe(true);
    expect(harness.storage.meta?.files.map((file) => file.path)).toContain(vanished);
  });

  it('honours the configured concurrency', async () => {
    const seed = makeSeed(200);
    const harness = makeHarness(seed, { concurrency: 3 });
    await syncContent(harness.input);
    expect(harness.reader.peak).toBeLessThanOrEqual(3);
    expect(harness.reader.peak).toBeGreaterThan(1);
  });

  it('keeps the session usable when the local write fails', async () => {
    const seed = makeSeed(3);
    const harness = makeHarness(seed);
    harness.storage.saveResult = 'failed';
    harness.storage.metaResult = 'failed';

    const result = await syncContent(harness.input);

    expect(result.ok).toBe(true);
    expect(result.persisted).toBe('failed');
  });

  it('reports locked writes without claiming success', async () => {
    const seed = makeSeed(3);
    const harness = makeHarness(seed);
    harness.storage.saveResult = 'locked';
    harness.storage.metaResult = 'locked';

    const result = await syncContent(harness.input);

    expect(result.ok).toBe(false);
    expect(result.persisted).toBe('locked');
  });

  it('stops applying results once cancelled', async () => {
    const seed = makeSeed(3);
    const { storage, input } = makeHarness(seed);
    const result = await syncContent({ ...input, isCancelled: () => true });

    expect(result.ok).toBe(false);
    expect(result.mode).toBe('full');
    expect(storage.meta).toBeNull();
  });
});
