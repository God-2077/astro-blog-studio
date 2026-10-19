import { create } from 'zustand';
import type { ContentFile, ContentSnapshot } from '@/lib/content/model';
import { type ContentStorage, createContentStorage, dropContentMemory } from '@/lib/content/storage';
import { type SyncCounts, type SyncMode, type SyncResult, syncContent } from '@/lib/content/sync';
import { mapError } from '@/lib/github/errors';
import type { FileContent } from '@/lib/github/types';
import { type PostSummary, summarize } from '@/lib/posts/summary';

export type ContentStatus = 'idle' | 'checking' | 'loading' | 'updating' | 'ready' | 'error';

export interface ContentPrepareInput {
  repoKey: string;
  signature: string;
  kind: 'demo' | 'live';
}

export interface ContentSyncInput {
  /** Target chunks from `planIndex`: already filtered, sorted and capped. */
  chunks: Array<Array<{ path: string; sha: string }>>;
  treeSha: string;
  truncated: boolean;
  forceFull?: boolean;
  readFiles: (paths: string[]) => Promise<FileContent[]>;
  concurrency: number;
  visibleTotal: number;
  indexed: number;
}

interface ContentState {
  repoKey: string | null;
  signature: string | null;
  status: ContentStatus;
  /** True from an explicit “检查更新” click until the tree + cache reconcile settles. */
  checkPending: boolean;
  /** Mode of the last sync: `full` on a first load, `delta` when reconciling. */
  mode: SyncMode | null;
  progress: { done: number; total: number };
  summaries: PostSummary[];
  /** Visible posts in HEAD (may exceed the 1000-file index cap). */
  visibleTotal: number;
  /** Posts this cache is responsible for (capped at CONTENT_MAX_FILES). */
  indexed: number;
  skipped: number;
  failedBatches: number;
  truncated: boolean;
  treeSha: string | null;
  lastSyncedAt: number | null;
  cachedCount: number;
  persist: 'ok' | 'failed' | 'locked' | null;
  counts: SyncCounts | null;
  error: string | null;
  prepare: (input: ContentPrepareInput) => Promise<void>;
  syncWithTree: (input: ContentSyncInput) => Promise<SyncResult | null>;
  /** Mark an explicit user check as running; shared by every “检查更新” button. */
  beginCheck: () => void;
  /** Release one explicit check; keeps the flag until the last one settles. */
  endCheck: () => void;
  /** Surface a failure that happened before `syncWithTree` could report it. */
  fail: (message: string) => void;
  /** Drop the local cache for this repo and re-read it on the next sync. */
  clearLocal: () => Promise<void>;
  reset: () => void;
  clearError: () => void;
}

const SUMMARY_BATCH = 50;

let storage: ContentStorage | null = null;
let preparedId: string | null = null;
let preparing: Promise<void> | null = null;
let repoKeyStored: string | null = null;
let signatureStored: string | null = null;
let epoch = 0;
let queued: Promise<void> = Promise.resolve();
let summariesByPath = new Map<string, PostSummary>();
let activeChecks = 0;

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function sortedSummaries(): PostSummary[] {
  return [...summariesByPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function mergeSummaries(files: ContentFile[]): void {
  for (const file of files) summariesByPath.set(file.path, summarize(file.text, file.path));
  useContent.setState({ summaries: sortedSummaries() });
}

async function summarizeFiles(files: Iterable<ContentFile>, runEpoch: number): Promise<void> {
  let batch: ContentFile[] = [];
  for (const file of files) {
    batch.push(file);
    if (batch.length < SUMMARY_BATCH) continue;
    if (epoch !== runEpoch) return;
    mergeSummaries(batch);
    batch = [];
    await yieldToUi();
  }
  if (batch.length > 0 && epoch === runEpoch) mergeSummaries(batch);
}

// The store below must exist before these helpers run; they only run from actions.
function applyResult(result: SyncResult, input: ContentSyncInput): void {
  const state = useContent.getState();
  const persist = result.persisted === 'none' ? null : result.persisted === 'saved' ? 'ok' : result.persisted;
  const common: Partial<ContentState> = {
    mode: result.mode === 'unchanged' ? null : result.mode,
    skipped: result.skipped,
    failedBatches: result.failedBatches,
    persist,
    truncated: input.truncated,
    treeSha: result.meta?.treeSha ?? state.treeSha,
    lastSyncedAt: Date.now(),
    cachedCount: result.meta?.files.length ?? state.cachedCount,
    visibleTotal: input.visibleTotal,
    indexed: input.indexed,
    counts: result.mode === 'unchanged' ? null : result.counts,
    progress: { done: 0, total: 0 },
  };
  if (!result.ok) {
    useContent.setState({ ...common, status: 'error', error: '部分文章同步失败，请重试。' });
    return;
  }
  useContent.setState({ ...common, status: 'ready', error: null });
}

export const useContent = create<ContentState>()((set) => ({
  repoKey: null,
  signature: null,
  status: 'idle',
  checkPending: false,
  mode: null,
  progress: { done: 0, total: 0 },
  summaries: [],
  visibleTotal: 0,
  indexed: 0,
  skipped: 0,
  failedBatches: 0,
  truncated: false,
  treeSha: null,
  lastSyncedAt: null,
  cachedCount: 0,
  persist: null,
  counts: null,
  error: null,

  prepare: async (input) => {
    const id = `${input.repoKey}\u0000${input.signature}`;
    if (preparedId === id && storage) {
      if (preparing) await preparing;
      return;
    }

    epoch += 1;
    const runEpoch = epoch;
    preparedId = id;
    repoKeyStored = input.repoKey;
    signatureStored = input.signature;
    storage = createContentStorage(input.repoKey, input.kind);
    summariesByPath = new Map();
    set({
      repoKey: input.repoKey,
      signature: input.signature,
      status: 'checking',
      mode: null,
      progress: { done: 0, total: 0 },
      summaries: [],
      visibleTotal: 0,
      indexed: 0,
      skipped: 0,
      failedBatches: 0,
      truncated: false,
      treeSha: null,
      lastSyncedAt: null,
      cachedCount: 0,
      persist: null,
      counts: null,
      error: null,
    });

    const active = storage;
    const load = (async (): Promise<void> => {
      const snapshot = await active.load().catch(() => null);
      if (epoch !== runEpoch || !snapshot) return;
      await summarizeFiles(snapshot.files.values(), runEpoch);
      if (epoch !== runEpoch) return;
      set({
        treeSha: snapshot.meta.treeSha,
        lastSyncedAt: snapshot.meta.savedAt,
        cachedCount: snapshot.meta.files.length,
        status: 'checking',
      });
    })();
    preparing = load;
    void load
      .finally(() => {
        if (preparing === load) preparing = null;
      })
      .catch(() => {});
    await load.catch(() => {});
  },

  syncWithTree: (input) => {
    const run = async (): Promise<SyncResult | null> => {
      if (preparing) await preparing;
      const repoKey = repoKeyStored;
      const signature = signatureStored;
      const active = storage;
      if (!repoKey || !signature || !active) return null;
      const runEpoch = epoch;

      set({
        status: 'checking',
        visibleTotal: input.visibleTotal,
        indexed: input.indexed,
        truncated: input.truncated,
        counts: null,
        error: null,
      });

      try {
        const result = await syncContent({
          storage: active,
          repoKey,
          signature,
          targets: input.chunks.flat(),
          treeSha: input.treeSha,
          truncated: input.truncated,
          forceFull: Boolean(input.forceFull),
          readFiles: input.readFiles,
          concurrency: input.concurrency,
          isCancelled: () => epoch !== runEpoch,
          onProgress: (progress, mode) => {
            if (epoch !== runEpoch || progress.phase !== 'fetch') return;
            set({
              status: mode === 'full' ? 'loading' : 'updating',
              mode,
              progress: { done: progress.done, total: progress.total },
            });
          },
          onLoaded: (snapshot: ContentSnapshot | null) => {
            if (epoch !== runEpoch || !snapshot) return;
            const missing = [...snapshot.files.values()].filter((file) => !summariesByPath.has(file.path));
            if (missing.length > 0) void summarizeFiles(missing, runEpoch);
          },
          onFiles: (files) => {
            if (epoch !== runEpoch) return;
            mergeSummaries(files);
          },
          onDeleted: (paths) => {
            if (epoch !== runEpoch) return;
            for (const path of paths) summariesByPath.delete(path);
            set({ summaries: sortedSummaries() });
          },
        });
        if (epoch !== runEpoch) return null;
        applyResult(result, input);
        return result;
      } catch (caught) {
        if (epoch !== runEpoch) return null;
        set({ status: 'error', error: mapError(caught).message, progress: { done: 0, total: 0 } });
        return null;
      }
    };

    const next = queued.then(run, run);
    queued = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  },

  beginCheck: () => {
    activeChecks += 1;
    set({ checkPending: true });
  },

  endCheck: () => {
    activeChecks = Math.max(0, activeChecks - 1);
    set({ checkPending: activeChecks > 0 });
  },

  fail: (message) => {
    set({ status: 'error', error: message, progress: { done: 0, total: 0 } });
  },

  clearLocal: async () => {
    epoch += 1;
    const active = storage;
    if (active) await active.clear().catch(() => false);
    dropContentMemory();
    summariesByPath = new Map();
    set({
      status: 'checking',
      mode: null,
      progress: { done: 0, total: 0 },
      summaries: [],
      skipped: 0,
      failedBatches: 0,
      treeSha: null,
      lastSyncedAt: null,
      cachedCount: 0,
      persist: null,
      counts: null,
      error: null,
    });
  },

  reset: () => {
    epoch += 1;
    activeChecks = 0;
    storage = null;
    preparing = null;
    preparedId = null;
    repoKeyStored = null;
    signatureStored = null;
    queued = Promise.resolve();
    summariesByPath = new Map();
    dropContentMemory();
    set({
      repoKey: null,
      signature: null,
      status: 'idle',
      checkPending: false,
      mode: null,
      progress: { done: 0, total: 0 },
      summaries: [],
      visibleTotal: 0,
      indexed: 0,
      skipped: 0,
      failedBatches: 0,
      truncated: false,
      treeSha: null,
      lastSyncedAt: null,
      cachedCount: 0,
      persist: null,
      counts: null,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
