import { type UseQueryResult, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { clampIndexConcurrency } from '@/lib/config/schema';
import { useGateway } from '@/lib/gateway/context';
import type { FileContent, GitHubGateway, RepoInfo, TreeResult } from '@/lib/github/types';
import {
  INDEX_CHUNK_SIZE,
  type IndexEntry,
  MAX_INDEX_FILES,
  type PostSummary,
  planIndex,
  summarize,
} from '@/lib/posts/summary';
import { buildTreeModel, type TreeModel } from '@/lib/tree/model';
import { createLimiter } from '@/lib/utils/limiter';
import { useSettings } from '@/stores/settings';

export type { PostSummary } from '@/lib/posts/summary';

export function useRepoInfo() {
  const { gateway, key, repo } = useGateway();
  return useQuery<RepoInfo>({
    queryKey: ['repo', key],
    queryFn: () => gateway.getRepo(),
    initialData: repo,
    staleTime: 60_000,
  });
}

export function useTree() {
  const { gateway, key } = useGateway();
  return useQuery<TreeResult>({
    queryKey: ['tree', key],
    queryFn: () => gateway.getTree(),
    staleTime: 30_000,
  });
}

export function useTreeModel(): { tree: ReturnType<typeof useTree>; model: TreeModel | null } {
  const tree = useTree();
  const { config } = useGateway();
  const model = useMemo(
    () =>
      tree.data
        ? buildTreeModel(tree.data.entries, {
            rootDir: config.rootDir,
            extensions: config.extensions,
            excludes: config.excludes,
          })
        : null,
    [tree.data, config.rootDir, config.extensions, config.excludes],
  );
  return { tree, model };
}

export function useFile(path: string | null) {
  const { gateway, key } = useGateway();
  return useQuery({
    queryKey: ['file', key, path],
    queryFn: () => {
      if (!path) throw new Error('missing path');
      return gateway.readFile(path);
    },
    enabled: Boolean(path),
    staleTime: 60_000,
  });
}

export interface FrontmatterIndex {
  /** Summaries from every batch that has already finished. */
  summaries: PostSummary[];
  /** Files actually parsed so far (cache hits included). */
  scanned: number;
  /** Visible markdown files in the tree. */
  total: number;
  /** How many files this index can cover (total capped at MAX_INDEX_FILES). */
  indexed: number;
  /** Files that returned no content (missing, oversized, binary) once indexing settles. */
  skipped: number;
  /** At least one batch is still on the wire. */
  isIndexing: boolean;
  /** Nothing readable yet — the sheet should keep its skeleton. */
  isLoadingFirst: boolean;
  failedChunks: number;
  error: Error | null;
  refetchFailed: () => void;
}

const INDEX_STALE_MS = 10 * 60_000;
const INDEX_GC_MS = 30 * 60_000;

interface ChunkSummary {
  summaries: PostSummary[];
  /** Paths this batch asked for but GitHub returned no text for. */
  missing: number;
}

interface IndexCombineResult {
  summaries: PostSummary[];
  missing: number;
  pendingChunks: number;
  failedChunks: number;
  error: Error | null;
}

function combineIndex(results: Array<UseQueryResult<ChunkSummary, Error>>): IndexCombineResult {
  const summaries: PostSummary[] = [];
  let missing = 0;
  let pendingChunks = 0;
  let failedChunks = 0;
  let error: Error | null = null;

  for (const result of results) {
    if (result.data) {
      summaries.push(...result.data.summaries);
      missing += result.data.missing;
    } else if (result.isError) {
      failedChunks += 1;
      error = error ?? result.error;
    } else pendingChunks += 1;
  }
  return { summaries, missing, pendingChunks, failedChunks, error };
}

async function readChunkSummary(
  gateway: GitHubGateway,
  queryClient: ReturnType<typeof useQueryClient>,
  key: string,
  chunk: IndexEntry[],
): Promise<ChunkSummary> {
  const summaries: PostSummary[] = [];
  const pending: string[] = [];

  for (const entry of chunk) {
    const cached = queryClient.getQueryData<FileContent>(['file', key, entry.path]);
    if (cached && cached.sha === entry.sha) summaries.push(summarize(cached.text, entry.path));
    else pending.push(entry.path);
  }

  let missing = 0;
  if (pending.length > 0) {
    const files = await gateway.readFiles(pending);
    for (const file of files) {
      queryClient.setQueryData(['file', key, file.path], file);
      summaries.push(summarize(file.text, file.path));
    }
    missing = pending.length - files.length;
  }

  return { summaries: summaries.sort((a, b) => a.path.localeCompare(b.path)), missing };
}

/**
 * Index the frontmatter of every visible markdown file, 20 per batch.
 *
 * `path-slice(0, 12)` used to decide the "recent" list, which meant the twelve
 * alphabetically-first files were the only candidates. This hook reads the whole
 * index in batches so "最近动过" and the draft/encrypted counters are global.
 *
 * Batches are keyed by `treeSha`, so re-entering the dashboard on the same tree
 * hits the cache; when the tree changes, a batch whose blobs are all still in the
 * `['file']` cache resolves without a request (incremental).
 */
export function useFrontmatterIndex(files: IndexEntry[], treeSha?: string): FrontmatterIndex {
  const { gateway, key } = useGateway();
  const queryClient = useQueryClient();
  const indexConcurrency = useSettings((state) => state.content.indexConcurrency);
  const limit = useMemo(() => createLimiter(clampIndexConcurrency(indexConcurrency)), [indexConcurrency]);

  const plan = useMemo(() => planIndex(files, INDEX_CHUNK_SIZE, MAX_INDEX_FILES), [files]);
  const enabled = Boolean(treeSha);
  const summariesKey = useMemo(() => ['summaries', key, treeSha ?? null], [key, treeSha]);

  const combined = useQueries({
    queries: plan.chunks.map((chunk, index) => ({
      queryKey: [...summariesKey, index],
      queryFn: () => limit(() => readChunkSummary(gateway, queryClient, key, chunk)),
      enabled,
      staleTime: INDEX_STALE_MS,
      gcTime: INDEX_GC_MS,
    })),
    combine: combineIndex,
  });

  const refetchFailed = () => {
    void queryClient.refetchQueries({ queryKey: summariesKey });
  };

  const isIndexing = enabled && combined.pendingChunks > 0;

  return {
    summaries: combined.summaries,
    scanned: combined.summaries.length,
    total: plan.total,
    indexed: plan.indexed,
    skipped: combined.missing,
    isIndexing,
    isLoadingFirst: enabled && plan.chunks.length > 0 && combined.pendingChunks === plan.chunks.length,
    failedChunks: combined.failedChunks,
    error: combined.error,
    refetchFailed,
  };
}
