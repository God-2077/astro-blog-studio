import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useTreeModel } from '@/hooks/use-data';
import { clampIndexConcurrency } from '@/lib/config/schema';
import { contentRepoKey, contentSignature } from '@/lib/content/model';
import type { SyncResult } from '@/lib/content/sync';
import { useGateway } from '@/lib/gateway/context';
import { mapError } from '@/lib/github/errors';
import { INDEX_CHUNK_SIZE, MAX_INDEX_FILES, planIndex } from '@/lib/posts/summary';
import { buildTreeModel } from '@/lib/tree/model';
import { useContent } from '@/stores/content';
import { useSettings } from '@/stores/settings';

export interface ContentActions {
  checkNow: (options?: { forceFull?: boolean; notify?: boolean }) => Promise<SyncResult | null>;
  busy: boolean;
}

function isBusyStatus(status: string): boolean {
  return status === 'checking' || status === 'loading' || status === 'updating';
}

/**
 * Drives the local article cache from the AppShell: load the encrypted cache
 * once per session, then reconcile it with every new HEAD tree. Mounted for the
 * dashboard, editor and settings so the tree refresh button always checks the
 * content as well.
 */
export function useContentSync(): void {
  const { gateway, repo, config, mode } = useGateway();
  const { tree, model } = useTreeModel();
  const indexConcurrency = useSettings((state) => state.content.indexConcurrency);
  const repoKey = contentRepoKey(mode, repo, repo.defaultBranch);
  const signature = contentSignature(config);

  useEffect(() => {
    void useContent.getState().prepare({ repoKey, signature, kind: mode });
  }, [repoKey, signature, mode]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: repo/config changes reset the cache identity even when React Query reuses the same tree object
  useEffect(() => {
    if (!tree.data || !model) return;
    const plan = planIndex(model.files, INDEX_CHUNK_SIZE, MAX_INDEX_FILES);
    void useContent.getState().syncWithTree({
      chunks: plan.chunks,
      treeSha: tree.data.sha,
      truncated: tree.data.truncated,
      readFiles: (paths) => gateway.readFiles(paths),
      concurrency: clampIndexConcurrency(indexConcurrency),
      visibleTotal: plan.total,
      indexed: plan.indexed,
    });
  }, [tree.data, model, gateway, indexConcurrency, repoKey, signature]);
}

/** Explicit user actions: dashboard "检查更新" and settings "强制全量更新". */
export function useContentActions(): ContentActions {
  const { gateway, repo, config, mode } = useGateway();
  const { tree } = useTreeModel();
  const indexConcurrency = useSettings((state) => state.content.indexConcurrency);
  const busy = useContent((state) => isBusyStatus(state.status));
  const repoKey = contentRepoKey(mode, repo, repo.defaultBranch);
  const signature = contentSignature(config);

  const checkNow = useCallback<ContentActions['checkNow']>(
    async (options = {}) => {
      const forceFull = Boolean(options.forceFull);
      if (forceFull) await useContent.getState().clearLocal();
      // Idempotent: returns immediately when this repo/config is already prepared.
      await useContent.getState().prepare({ repoKey, signature, kind: mode });

      let fresh: Awaited<ReturnType<typeof tree.refetch>>;
      try {
        fresh = await tree.refetch();
      } catch (caught) {
        if (options.notify) toast.error(mapError(caught).message);
        return null;
      }
      if (!fresh.data) {
        if (options.notify) toast.error(fresh.error ? mapError(fresh.error).message : '读取文件树失败，请重试');
        return null;
      }

      const plan = planIndex(buildTreeModel(fresh.data.entries, config).files, INDEX_CHUNK_SIZE, MAX_INDEX_FILES);
      const result = await useContent.getState().syncWithTree({
        chunks: plan.chunks,
        treeSha: fresh.data.sha,
        truncated: fresh.data.truncated,
        forceFull,
        readFiles: (paths) => gateway.readFiles(paths),
        concurrency: clampIndexConcurrency(indexConcurrency),
        visibleTotal: plan.total,
        indexed: plan.indexed,
      });

      if (!options.notify) return result;
      if (!result) toast.error('同步没有完成，请稍后重试');
      else if (!result.ok) toast.error('部分文章同步失败，请重试');
      else if (result.mode === 'unchanged') toast.success('已是最新');
      else if (result.mode === 'full') toast.success(`已读取全部 ${result.meta?.files.length ?? plan.indexed} 篇`);
      else
        toast.success(`已同步 · 新增 ${result.counts.added} / 修改 ${result.counts.modified} / 删除 ${result.counts.deleted}`);
      return result;
    },
    [repoKey, signature, mode, tree, gateway, config, indexConcurrency],
  );

  return { checkNow, busy };
}
