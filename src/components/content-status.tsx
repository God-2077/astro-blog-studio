import { RefreshCw } from 'lucide-react';
import { ErrorNote, Spinner } from '@/components/ui';
import type { SyncCounts, SyncMode } from '@/lib/content/sync';
import type { ContentStatus } from '@/stores/content';

export interface ContentStatusProps {
  status: ContentStatus;
  mode: SyncMode | null;
  progress: { done: number; total: number };
  counts: SyncCounts | null;
  persist: 'ok' | 'failed' | 'locked' | null;
  error: string | null;
  onRetry: () => void;
}

function percent(progress: { done: number; total: number }): number {
  if (progress.total <= 0) return 0;
  return Math.min(100, Math.round((progress.done / progress.total) * 100));
}

/**
 * In-place status strip for the article cache. Loading/updating is narrated
 * with a thin mint progress bar; failures stay inline with a retry button, and
 * a successful delta leaves a one-line receipt for the rest of the session.
 */
export function ContentSyncStatus({ status, mode, progress, counts, persist, error, onRetry }: ContentStatusProps) {
  const busy = status === 'checking' || status === 'loading' || status === 'updating';
  const failure = status === 'error';
  const hasCounts = Boolean(counts && counts.added + counts.modified + counts.deleted > 0);
  if (!busy && !failure && persist !== 'failed' && !hasCounts) return null;

  const label = failure
    ? '文章同步未完成'
    : status === 'checking'
      ? '正在检查远端更新…'
      : status === 'loading'
        ? mode === 'full'
          ? '首次加载 · 正在读取全部文章'
          : '正在读取本机缓存…'
        : status === 'updating'
          ? '正在同步文章变更'
          : '';

  return (
    <section className="mt-3 rounded-xl border border-dashed border-line bg-paper px-3 py-2" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        {busy ? <Spinner label={label} /> : <span className="text-[11px] text-muted">{label || '本机缓存'}</span>}
        {busy && progress.total > 0 ? (
          <span className="ml-auto font-mono text-[10px] text-muted">
            {progress.done} / {progress.total}
          </span>
        ) : null}
        {failure ? (
          <button type="button" className="abs-btn abs-btn-ghost ml-auto h-7 px-2.5 text-[10px]" onClick={onRetry}>
            <RefreshCw aria-hidden className="size-3" />
            重试
          </button>
        ) : null}
      </div>

      {busy && progress.total > 0 ? (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full border border-edge/20 bg-blush-2">
          <span className="abs-progress" style={{ width: `${percent(progress)}%` }} />
        </div>
      ) : null}

      {hasCounts && counts ? (
        <p className="mt-1 font-mono text-[10px] text-muted">
          已同步 · 新增 {counts.added} / 修改 {counts.modified} / 删除 {counts.deleted}
        </p>
      ) : null}

      {persist === 'failed' ? (
        <p className="mt-1 text-[10px] leading-relaxed text-muted">
          本机缓存写入失败（可能是空间不足）；本次会话仍可浏览，重新打开网站会重新读取。
        </p>
      ) : null}

      {failure ? <ErrorNote error={error ?? '上次同步没有完成'} onRetry={onRetry} className="mt-2" /> : null}
    </section>
  );
}
