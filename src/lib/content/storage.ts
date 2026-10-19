import { clear, createStore, delMany, entries, get, getMany, set, setMany } from 'idb-keyval';
import {
  type ContentEnvelope,
  contentFileAad,
  contentMetaAad,
  isContentEnvelope,
  openContent,
  sealContent,
} from '@/lib/content/envelope';
import {
  CONTENT_MAX_FILES,
  type ContentFile,
  type ContentMeta,
  type ContentSnapshot,
  contentFileKey,
  contentFilePrefix,
  contentFilePrefixFor,
  contentMetaKey,
  contentMetaPrefix,
  isContentFile,
  isContentMeta,
} from '@/lib/content/model';
import { vaultSession } from '@/lib/vault/session';

/**
 * One object store for both meta and article rows: `idb-keyval` opens a
 * database per store name, and two `createStore` calls on the same DB would
 * race the version upgrade (only the first store would be created).
 */
const store = createStore('abs-content', 'records');

/** Small enough to keep the UI responsive, big enough to amortize IndexedDB. */
const CRYPTO_BATCH = 8;
const LOAD_BATCH = 40;

export type ContentWriteResult = 'saved' | 'locked' | 'failed';

export interface ContentStorage {
  readonly repoKey: string;
  readonly kind: 'indexeddb' | 'memory';
  load(onProgress?: (done: number, total: number) => void): Promise<ContentSnapshot | null>;
  saveFiles(files: ContentFile[]): Promise<ContentWriteResult>;
  saveMeta(meta: ContentMeta): Promise<ContentWriteResult>;
  removeFiles(paths: string[]): Promise<void>;
  clear(): Promise<boolean>;
}

interface LiveMemory {
  repoKey: string;
  meta: ContentMeta | null;
  files: Map<string, ContentFile>;
}

/**
 * Write-through cache for the active repository. Re-renders and repeated
 * `load()` calls during one sync must not decrypt everything again; the
 * plaintext lives only here and is dropped on lock/reset.
 */
let liveMemory: LiveMemory | null = null;

async function runBatches<T>(items: readonly T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(run));
  }
}

function snapshotOf(memory: LiveMemory): ContentSnapshot | null {
  if (!memory.meta) return null;
  return { meta: memory.meta, files: memory.files };
}

function memoryFor(repoKey: string): LiveMemory {
  if (!liveMemory || liveMemory.repoKey !== repoKey) {
    liveMemory = { repoKey, meta: null, files: new Map() };
  }
  return liveMemory;
}

function createIndexedDbStorage(repoKey: string): ContentStorage {
  return {
    repoKey,
    kind: 'indexeddb',

    async load(onProgress) {
      if (liveMemory?.repoKey === repoKey) return snapshotOf(liveMemory);
      try {
        const rawMeta = await get(contentMetaKey(repoKey), store);
        if (!isContentEnvelope(rawMeta)) return null;
        const key = await vaultSession.getContentKey();
        if (!key) return null;
        const meta = await openContent(rawMeta, key, contentMetaAad(repoKey), isContentMeta);
        if (!meta || meta.repoKey !== repoKey) return null;

        const files = new Map<string, ContentFile>();
        const total = Math.min(meta.files.length, CONTENT_MAX_FILES);
        onProgress?.(0, total);
        for (let index = 0; index < meta.files.length; index += LOAD_BATCH) {
          const slice = meta.files.slice(index, index + LOAD_BATCH);
          const rows = await getMany(
            slice.map((file) => contentFileKey(repoKey, file.path)),
            store,
          );
          await Promise.all(
            slice.map(async (file, offset) => {
              const envelope = rows[offset];
              if (!isContentEnvelope(envelope)) return;
              const record = await openContent(envelope, key, contentFileAad(repoKey, file.path, file.sha), isContentFile);
              if (!record || record.path !== file.path || record.sha !== file.sha) return;
              files.set(record.path, record);
            }),
          );
          onProgress?.(Math.min(index + slice.length, total), total);
        }
        liveMemory = { repoKey, meta, files };
        return { meta, files };
      } catch {
        return null;
      }
    },

    async saveFiles(files) {
      const valid = files.filter(isContentFile);
      if (valid.length === 0) return 'saved';
      const key = await vaultSession.getContentKey();
      if (!key) return 'locked';
      const savedAt = Date.now();
      try {
        const rows: Array<[string, ContentEnvelope]> = [];
        await runBatches(valid, CRYPTO_BATCH, async (file) => {
          rows.push([
            contentFileKey(repoKey, file.path),
            await sealContent(file, key, contentFileAad(repoKey, file.path, file.sha), savedAt),
          ]);
        });
        await setMany(rows, store);
        const memory = memoryFor(repoKey);
        for (const file of valid) memory.files.set(file.path, file);
        return 'saved';
      } catch {
        return 'failed';
      }
    },

    async saveMeta(meta) {
      if (!isContentMeta(meta) || meta.repoKey !== repoKey) return 'failed';
      const key = await vaultSession.getContentKey();
      if (!key) return 'locked';
      try {
        await set(contentMetaKey(repoKey), await sealContent(meta, key, contentMetaAad(repoKey), meta.savedAt), store);
        memoryFor(repoKey).meta = meta;
        return 'saved';
      } catch {
        return 'failed';
      }
    },

    async removeFiles(paths) {
      if (paths.length === 0) return;
      try {
        await delMany(
          paths.map((path) => contentFileKey(repoKey, path)),
          store,
        );
      } catch {
        // Best effort; a leftover encrypted row is ignored because meta no longer lists it.
      }
      if (liveMemory?.repoKey === repoKey) {
        for (const path of paths) liveMemory.files.delete(path);
      }
    },

    async clear() {
      try {
        const metaKey = contentMetaKey(repoKey);
        const filePrefix = contentFilePrefix(repoKey);
        const doomed = (await entries(store))
          .map(([key]) => key)
          .filter((key) => String(key) === metaKey || String(key).startsWith(filePrefix));
        if (doomed.length > 0) await delMany(doomed, store);
      } catch {
        return false;
      }
      if (liveMemory?.repoKey === repoKey) liveMemory = null;
      return true;
    },
  };
}

/**
 * Demo repositories have no vault and hold fixture-only content, so their
 * "cache" stays in memory and never touches IndexedDB (mirrors backups).
 */
function createMemoryStorage(repoKey: string): ContentStorage {
  let meta: ContentMeta | null = null;
  const files = new Map<string, ContentFile>();

  return {
    repoKey,
    kind: 'memory',

    async load(onProgress) {
      onProgress?.(files.size, files.size);
      return meta ? { meta, files } : null;
    },

    async saveFiles(next) {
      for (const file of next.filter(isContentFile)) files.set(file.path, file);
      return 'saved';
    },

    async saveMeta(next) {
      if (!isContentMeta(next) || next.repoKey !== repoKey) return 'failed';
      meta = next;
      return 'saved';
    },

    async removeFiles(paths) {
      for (const path of paths) files.delete(path);
    },

    async clear() {
      meta = null;
      files.clear();
      return true;
    },
  };
}

export function createContentStorage(repoKey: string, mode: 'demo' | 'live'): ContentStorage {
  return mode === 'live' ? createIndexedDbStorage(repoKey) : createMemoryStorage(repoKey);
}

/** Drop decrypted articles from memory when the vault locks. */
export function dropContentMemory(): void {
  liveMemory = null;
}

/**
 * Clear every cached repository whose key starts with `prefix` (e.g. `live:` on
 * vault reset). Returns false when IndexedDB is unavailable.
 */
export async function clearContentByPrefix(prefix = ''): Promise<boolean> {
  if (liveMemory?.repoKey.startsWith(prefix)) liveMemory = null;
  try {
    const metaPrefix = contentMetaPrefix(prefix);
    const filePrefix = contentFilePrefixFor(prefix);
    const doomed = (await entries(store))
      .map(([key]) => key)
      .filter((key) => String(key).startsWith(metaPrefix) || String(key).startsWith(filePrefix));
    if (doomed.length > 0) await delMany(doomed, store);
    return true;
  } catch {
    return false;
  }
}

/** Test/settings helper: clear the whole store. */
export async function clearAllContent(): Promise<boolean> {
  liveMemory = null;
  try {
    await clear(store);
    return true;
  } catch {
    return false;
  }
}
