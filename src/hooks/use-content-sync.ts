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

/** One toast id so a repeated check updates the same loading toast in place. */
const CHECK_TOAST_ID = 'content-check';

export interface ContentActions {
  checkNow: (options?: { forceFull?: boolean; notify?: boolean }) => Promise<SyncResult | null>;
  /** A manual check is running, or the content store is syncing. */
  busy: boolean;
  /** An explicit “检查更新” click is in flight (shared by all buttons). */
  pending: boolean;
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
  const pending = useContent((state) => state.checkPending);
  const busy = useContent((state) => state.checkPending || isBusyStatus(state.status));
  const repoKey = contentRepoKey(mode, repo, repo.defaultBranch);
  const signature = contentSignature(config);

  const checkNow = useCallback<ContentActions['checkNow']>(
    async (options = {}) => {
      const forceFull = Boolean(options.forceFull);
      const notify = Boolean(options.notify);
      const state = useContent.getState();
      // Single-flight: every button disables itself, this also protects forced reloads.
      if (state.checkPending) return null;

      state.beginCheck();
      const toastId = notify
        ? toast.loading(forceFull ? '正在重新读取全部文章…' : '正在检查远端更新…', { id: CHECK_TOAST_ID })
        : null;
      let outcome: { ok: boolean; message: string } | null = null;

      /** Tree/refresh failures must not leave the store stuck on `checking`. */
      const failWith = (message: string): null => {
        outcome = { ok: false, message };
        const current = useContent.getState();
        if (isBusyStatus(current.status) || current.status === 'error') current.fail(message);
        return null;
      };

      try {
        if (forceFull) await state.clearLocal();
        // Idempotent: returns immediately when this repo/config is already prepared.
        await state.prepare({ repoKey, signature, kind: mode });

        let fresh: Awaited<ReturnType<typeof tree.refetch>>;
        try {
          fresh = await tree.refetch();
        } catch (caught) {
          return failWith(mapError(caught).message);
        }
        if (!fresh.data) {
          return failWith(fresh.error ? mapError(fresh.error).message : '读取文件树失败，请重试');
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

        if (!result) {
          outcome = { ok: false, message: '同步没有完成，请稍后重试' };
          return null;
        }
        if (!result.ok) {
          outcome = { ok: false, message: '部分文章同步失败，请重试' };
          return result;
        }

        outcome = {
          ok: true,
          message:
            result.mode === 'unchanged'
              ? '已是最新'
              : result.mode === 'full'
                ? `已读取全部 ${result.meta?.files.length ?? plan.indexed} 篇`
                : `已同步 · 新增 ${result.counts.added} / 修改 ${result.counts.modified} / 删除 ${result.counts.deleted}`,
        };
        return result;
      } catch (caught) {
        return failWith(mapError(caught).message);
      } finally {
        useContent.getState().endCheck();
        if (toastId !== null) {
          if (outcome?.ok) toast.success(outcome.message, { id: toastId });
          else if (outcome) toast.error(outcome.message, { id: toastId });
          else toast.dismiss(toastId);
        }
      }
    },
    [repoKey, signature, mode, tree, gateway, config, indexConcurrency],
  );

  return { checkNow, busy, pending };
}
