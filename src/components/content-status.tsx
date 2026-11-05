import { RefreshCw } from 'lucide-react';
import { ErrorNote, Spinner } from '@/components/ui';
import type { SyncCounts, SyncMode } from '@/lib/content/sync';
import { useT } from '@/lib/i18n/react';
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
  const t = useT();
  const busy = status === 'checking' || status === 'loading' || status === 'updating';
  const failure = status === 'error';
  const hasCounts = Boolean(counts && counts.added + counts.modified + counts.deleted > 0);
  if (!busy && !failure && persist !== 'failed' && !hasCounts) return null;

  const label = failure
    ? t('dashboard.status.error')
    : status === 'checking'
      ? t('dashboard.status.checking')
      : status === 'loading'
        ? mode === 'full'
          ? t('dashboard.status.loadingFull')
          : t('dashboard.status.loadingCache')
        : status === 'updating'
          ? t('dashboard.status.updating')
          : '';

  return (
    <section className="mt-3 rounded-xl border border-dashed border-line bg-paper px-3 py-2" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        {busy ? (
          <Spinner label={label} />
        ) : (
          <span className="text-[11px] text-muted">{label || t('dashboard.status.fallback')}</span>
        )}
        {busy && progress.total > 0 ? (
          <span className="ml-auto font-mono text-[10px] text-muted">
            {progress.done} / {progress.total}
          </span>
        ) : null}
        {failure ? (
          <button type="button" className="abs-btn abs-btn-ghost ml-auto h-7 px-2.5 text-[10px]" onClick={onRetry}>
            <RefreshCw aria-hidden className="size-3" />
            {t('common.retry')}
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
          {t('dashboard.status.synced', { added: counts.added, modified: counts.modified, deleted: counts.deleted })}
        </p>
      ) : null}

      {persist === 'failed' ? (
        <p className="mt-1 text-[10px] leading-relaxed text-muted">{t('dashboard.status.persistFailed')}</p>
      ) : null}

      {failure ? <ErrorNote error={error ?? t('dashboard.status.lastError')} onRetry={onRetry} className="mt-2" /> : null}
    </section>
  );
}
