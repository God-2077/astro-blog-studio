import type { ContentStorage, ContentWriteResult } from '@/lib/content/storage';
import type { FileContent } from '@/lib/github/types';
import { createLimiter } from '@/lib/utils/limiter';
import { diffContent } from './diff';
import {
  CONTENT_CACHE_VERSION,
  CONTENT_CHUNK_SIZE,
  CONTENT_MAX_FILES,
  type ContentFile,
  type ContentMeta,
  type ContentMetaFile,
  type ContentSnapshot,
  type ContentTarget,
  MAX_CONTENT_FILE_CHARS,
} from './model';

export type SyncMode = 'full' | 'delta';

export interface SyncProgress {
  phase: 'load' | 'fetch';
  done: number;
  total: number;
}

export interface SyncCounts {
  added: number;
  modified: number;
  deleted: number;
}

export interface SyncInput {
  storage: ContentStorage;
  repoKey: string;
  signature: string;
  targets: readonly ContentTarget[];
  treeSha: string;
  truncated: boolean;
  forceFull: boolean;
  readFiles: (paths: string[]) => Promise<FileContent[]>;
  concurrency: number;
  onProgress?: (progress: SyncProgress, mode: SyncMode) => void;
  onLoaded?: (snapshot: ContentSnapshot | null) => void;
  onFiles?: (files: ContentFile[], mode: SyncMode) => void;
  onDeleted?: (paths: string[]) => void;
  isCancelled?: () => boolean;
}

export interface SyncResult {
  ok: boolean;
  mode: SyncMode | 'unchanged';
  counts: SyncCounts;
  unchanged: number;
  skipped: number;
  failedBatches: number;
  /** `none` when nothing had to be written (unchanged tree). */
  persisted: ContentWriteResult | 'none';
  meta: ContentMeta | null;
}

function chunkTargets(targets: readonly ContentTarget[]): ContentTarget[][] {
  const chunks: ContentTarget[][] = [];
  for (let index = 0; index < targets.length; index += CONTENT_CHUNK_SIZE) {
    chunks.push(targets.slice(index, index + CONTENT_CHUNK_SIZE));
  }
  return chunks;
}

function buildMeta(files: Iterable<ContentMetaFile>, input: SyncInput): ContentMeta {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  return {
    version: CONTENT_CACHE_VERSION,
    repoKey: input.repoKey,
    signature: input.signature,
    treeSha: input.treeSha,
    savedAt: Date.now(),
    files: sorted.slice(0, CONTENT_MAX_FILES),
  };
}

/**
 * Reconcile the local encrypted cache with the HEAD tree.
 *
 * The only network work is reading added/modified blobs (20 per GraphQL batch);
 * an untouched tree returns after the cache load without a single content
 * request. Batch failures are tolerated: whatever was read is kept and
 * persisted, failed `modified` paths keep their old sha so the next run retries
 * them, failed `added` paths are simply absent from the new meta.
 */
export async function syncContent(input: SyncInput): Promise<SyncResult> {
  const cancelled = (): boolean => Boolean(input.isCancelled?.());
  const result: SyncResult = {
    ok: false,
    mode: 'unchanged',
    counts: { added: 0, modified: 0, deleted: 0 },
    unchanged: 0,
    skipped: 0,
    failedBatches: 0,
    persisted: 'none',
    meta: null,
  };

  if (input.forceFull) await input.storage.clear();

  const hint: SyncMode = input.forceFull ? 'full' : 'delta';
  input.onProgress?.({ phase: 'load', done: 0, total: 0 }, hint);
  let snapshot = await input.storage.load((done, total) => input.onProgress?.({ phase: 'load', done, total }, hint));
  let mode: SyncMode = snapshot ? 'delta' : 'full';
  result.mode = mode;
  if (cancelled()) return result;
  input.onLoaded?.(snapshot);

  if (snapshot && snapshot.meta.signature !== input.signature) {
    await input.storage.clear();
    snapshot = null;
    mode = 'full';
    result.mode = mode;
    input.onLoaded?.(null);
    if (cancelled()) return result;
  }

  if (
    mode === 'delta' &&
    snapshot &&
    !input.forceFull &&
    snapshot.meta.treeSha === input.treeSha &&
    snapshot.meta.files.length === input.targets.length &&
    snapshot.files.size === snapshot.meta.files.length
  ) {
    result.ok = true;
    result.mode = 'unchanged';
    result.meta = snapshot.meta;
    result.unchanged = input.targets.length;
    return result;
  }

  const base = new Map<string, string>();
  if (snapshot) {
    for (const file of snapshot.files.values()) base.set(file.path, file.sha);
  }
  const delta = diffContent(base, input.targets);
  result.counts = { added: delta.added.length, modified: delta.modified.length, deleted: delta.deleted.length };
  result.unchanged = delta.unchanged;

  if (mode === 'delta' && !input.truncated && delta.deleted.length > 0) {
    await input.storage.removeFiles(delta.deleted);
    input.onDeleted?.(delta.deleted);
    if (cancelled()) return result;
  }

  const toFetch: ContentTarget[] = mode === 'full' ? [...input.targets] : [...delta.added, ...delta.modified];
  const groups = chunkTargets(toFetch);
  const fetched = new Map<string, ContentFile>();
  const limit = createLimiter(input.concurrency);
  let done = 0;
  let skipped = 0;
  let failedBatches = 0;
  let savedAny = false;
  let failedAny = false;
  let locked = false;
  const noteWrite = (next: ContentWriteResult): void => {
    if (next === 'saved') savedAny = true;
    else if (next === 'failed') failedAny = true;
    else locked = true;
  };

  input.onProgress?.({ phase: 'fetch', done: 0, total: toFetch.length }, mode);

  await Promise.all(
    groups.map((group) =>
      limit(async () => {
        if (cancelled()) return;
        let files: FileContent[];
        try {
          files = await input.readFiles(group.map((target) => target.path));
        } catch {
          failedBatches += 1;
          done += group.length;
          input.onProgress?.({ phase: 'fetch', done, total: toFetch.length }, mode);
          return;
        }

        const wanted = new Set(group.map((target) => target.path));
        const accepted: ContentFile[] = [];
        for (const file of files) {
          if (!wanted.has(file.path)) continue;
          if (!file.text || file.text.length > MAX_CONTENT_FILE_CHARS) continue;
          accepted.push({ path: file.path, sha: file.sha, text: file.text, size: file.text.length });
        }
        skipped += group.length - accepted.length;

        if (accepted.length > 0) {
          noteWrite(await input.storage.saveFiles(accepted));
          for (const file of accepted) fetched.set(file.path, file);
          input.onFiles?.(accepted, mode);
        }
        done += group.length;
        input.onProgress?.({ phase: 'fetch', done, total: toFetch.length }, mode);
      }),
    ),
  );

  result.skipped = skipped;
  result.failedBatches = failedBatches;

  if (cancelled()) {
    result.persisted = locked ? 'locked' : failedAny ? 'failed' : savedAny ? 'saved' : 'none';
    return result;
  }

  // Keep unchanged cache entries (and, for a truncated tree, entries we could
  // not see in this listing) so the next diff still has their blob shas. The
  // decrypted record wins over meta because it is what the file row is bound to;
  // a failed fetch after a failed previous write must not persist a stale sha.
  const targetByPath = new Map(input.targets.map((target) => [target.path, target]));
  const nextFiles = new Map<string, ContentMetaFile>();
  if (mode === 'delta' && snapshot) {
    for (const metaFile of snapshot.meta.files) {
      if (!targetByPath.has(metaFile.path) && !input.truncated) continue;
      if (fetched.has(metaFile.path)) continue;
      const cached = snapshot.files.get(metaFile.path);
      nextFiles.set(metaFile.path, cached ? { path: cached.path, sha: cached.sha, chars: cached.text.length } : metaFile);
    }
  }
  for (const file of fetched.values()) {
    nextFiles.set(file.path, { path: file.path, sha: file.sha, chars: file.text.length });
  }

  const meta = buildMeta(nextFiles.values(), input);
  noteWrite(await input.storage.saveMeta(meta));
  result.meta = meta;
  result.persisted = locked ? 'locked' : failedAny ? 'failed' : savedAny ? 'saved' : 'none';
  result.ok = !locked && failedBatches === 0;
  return result;
}
