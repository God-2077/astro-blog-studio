import { Archive, ArrowUpRight, Check, ChevronDown, Clock3, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { confirmAction } from '@/components/confirm-toast';
import { ContentSyncStatus } from '@/components/content-status';
import { NewPostDialog } from '@/components/new-post-dialog';
import { Badge, EmptyState, ErrorNote, SkeletonList } from '@/components/ui';
import { useContentActions } from '@/hooks/use-content-sync';
import { useTreeModel } from '@/hooks/use-data';
import { useParkPendingDraft } from '@/hooks/use-pending-draft';
import { backupRepoKey } from '@/lib/backup/model';
import type { DraftBoxItem } from '@/lib/drafts/box';
import { draftCharCount } from '@/lib/drafts/model';
import { useGateway } from '@/lib/gateway/context';
import { useActiveLocale, useT } from '@/lib/i18n/react';
import { isMarkdownDocument, normalizeRepoPath } from '@/lib/paths/paths';
import { type PostSortKey, postSortValue, RECENT_PAGE_SIZE, sortPosts } from '@/lib/posts/summary';
import { cn } from '@/lib/utils/cn';
import { displayDate, formatInTimeZone } from '@/lib/utils/date';
import { useContent } from '@/stores/content';
import { type DraftsStatus, useDrafts } from '@/stores/drafts';
import { useLastCommit } from '@/stores/last-commit';
import { usePendingPost } from '@/stores/pending-post';
import { useRateLimit } from '@/stores/rate-limit';

export function DashboardPage() {
  const t = useT();
  const locale = useActiveLocale();
  const { mode, config, repo } = useGateway();
  const { tree, model } = useTreeModel();
  const content = useContent();
  const { checkNow, busy, pending } = useContentActions();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sortKey, setSortKey] = useState<PostSortKey>('updated');
  const [visibleCount, setVisibleCount] = useState(RECENT_PAGE_SIZE);
  const lastCommit = useLastCommit((state) => state.commit);
  const rate = useRateLimit();
  const draftBox = useDrafts();
  const loadDrafts = useDrafts((state) => state.load);
  const parkPendingDraft = useParkPendingDraft();
  const repoKey = backupRepoKey(mode, repo);
  const [listMode, setListMode] = useState<'posts' | 'drafts'>(params.get('drafts') === '1' ? 'drafts' : 'posts');

  useEffect(() => {
    void loadDrafts(repoKey);
  }, [loadDrafts, repoKey]);

  const toggleListMode = (): void => {
    if (listMode === 'posts') void loadDrafts(repoKey);
    setListMode(listMode === 'drafts' ? 'posts' : 'drafts');
  };

  const sorted = useMemo(() => sortPosts(content.summaries, sortKey), [content.summaries, sortKey]);
  const recent = sorted.slice(0, visibleCount);
  const hasMore = recent.length < sorted.length;
  const drafts = content.summaries.filter((item) => item.draft).length;
  const encrypted = content.summaries.filter((item) => item.encrypted).length;
  const isSyncing = content.status === 'checking' || content.status === 'loading' || content.status === 'updating';
  const isLoadingFirst = content.summaries.length === 0 && content.status !== 'ready' && content.status !== 'error';
  const statsLoading = content.summaries.length === 0 && isSyncing;
  const summaryLabel = isSyncing
    ? t('dashboard.summary.syncing', { done: content.progress.done, total: content.progress.total || content.indexed })
    : content.indexed > 0
      ? t('dashboard.summary.all', { count: content.indexed })
      : t('dashboard.summary.frontmatter');
  const syncLabel =
    content.status === 'loading' || content.status === 'updating'
      ? t('dashboard.actions.sync.syncing')
      : busy
        ? t('dashboard.actions.sync.checking')
        : t('dashboard.actions.sync.idle');
  const effectiveStatus = pending && !isSyncing ? 'checking' : content.status;
  const today = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: config.timezone }).format(new Date());

  const changeSort = (next: PostSortKey): void => {
    if (next === sortKey) return;
    setSortKey(next);
    setVisibleCount(RECENT_PAGE_SIZE);
  };

  const loadMore = (): void => {
    setVisibleCount((count) => count + RECENT_PAGE_SIZE);
  };

  const openDialog = params.get('new') === '1' || dialogOpen;
  const setDialog = (open: boolean): void => {
    setDialogOpen(open);
    if (!open && params.get('new')) {
      const next = new URLSearchParams(params);
      next.delete('new');
      setParams(next, { replace: true });
    }
  };

  const openDraft = async (draft: DraftBoxItem): Promise<void> => {
    // Leaving another unfinished new post behind must not lose it; park it in
    // the box first so several drafts can coexist.
    if (usePendingPost.getState().draft) {
      const result = await parkPendingDraft();
      if (result === 'failed') {
        toast.error(t('dashboard.drafts.parkFailedTitle'), {
          description: t('dashboard.drafts.parkFailedDescription'),
        });
        return;
      }
    }
    if (draft.isNew) {
      usePendingPost.getState().setDraft({ path: draft.path, text: draft.text });
      navigate(`/edit?path=${encodeURIComponent(draft.path)}&new=1&draft=1`);
      return;
    }
    navigate(`/edit?path=${encodeURIComponent(draft.path)}&draft=1`);
  };

  const removeDraftItem = async (draft: DraftBoxItem): Promise<void> => {
    const confirmed = await confirmAction(t('dashboard.drafts.removeTitle', { title: draft.title }), {
      description: t('dashboard.drafts.removeDescription'),
      confirmLabel: t('dashboard.drafts.removeConfirm'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await useDrafts.getState().remove(repoKey, draft.path);
    } catch (caught) {
      toast.error(t('dashboard.drafts.removeFailedTitle'), {
        description: caught instanceof Error ? caught.message : t('dashboard.drafts.removeFailedDescription'),
      });
      return;
    }
    // A deleted new-post draft must not be resurrected by the next park.
    const pendingPost = usePendingPost.getState().draft;
    if (pendingPost && normalizeRepoPath(pendingPost.path) === normalizeRepoPath(draft.path)) {
      usePendingPost.getState().clearDraft();
    }
    toast.success(t('dashboard.drafts.removed'));
  };

  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <section className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-sakura">
              {mode === 'demo' ? t('dashboard.eyebrow.demo') : t('dashboard.eyebrow.live')}
            </p>
            <h1 className="mt-1 font-display text-[clamp(26px,3vw,36px)] font-bold leading-tight">{t('dashboard.title')}</h1>
            <p className="mt-1 text-[11px] text-muted">
              {today} · {repo.owner}/{repo.name} · {config.rootDir}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="abs-btn abs-btn-ghost h-8"
              onClick={() => void checkNow({ notify: true })}
              disabled={busy}
              aria-busy={busy}
            >
              <RefreshCw aria-hidden className={cn('size-3.5', busy && 'animate-spin')} />
              {syncLabel}
            </button>
            <button
              type="button"
              className={cn('abs-btn h-8', listMode === 'drafts' ? 'bg-blush-2' : 'abs-btn-ghost')}
              onClick={toggleListMode}
              aria-pressed={listMode === 'drafts'}
              title={listMode === 'drafts' ? t('dashboard.actions.drafts.close') : t('dashboard.actions.drafts.open')}
            >
              <Archive aria-hidden className="size-3.5" />
              {t('dashboard.actions.drafts.label')}
              {draftBox.items.length > 0 ? (
                <span className="rounded-full border border-edge/30 bg-butter px-1.5 font-mono text-[9px] leading-4 text-ink-soft">
                  {draftBox.items.length}
                </span>
              ) : null}
            </button>
            <button type="button" className="abs-btn abs-btn-primary" onClick={() => setDialog(true)}>
              <Plus aria-hidden className="size-3.5" />
              {t('dashboard.actions.newPost')}
            </button>
          </div>
        </section>

        {tree.error ? <ErrorNote error={tree.error} onRetry={() => void tree.refetch()} className="mt-4" /> : null}
        {tree.data?.truncated ? (
          <p className="mt-2 px-1 font-mono text-[9.5px] text-muted">{t('dashboard.treeTruncated')}</p>
        ) : null}

        <ContentSyncStatus
          status={effectiveStatus}
          mode={content.mode}
          progress={content.progress}
          counts={content.counts}
          persist={content.persist}
          error={content.error}
          onRetry={() => void checkNow({ notify: true })}
        />

        <section className="mt-4 grid grid-cols-3 gap-2 sm:gap-2.5" aria-label={t('dashboard.stats.label')}>
          <div className="abs-sticky bg-mint-2 rotate-[-0.7deg]">
            <span className="abs-sticky-label">{t('dashboard.stats.posts')}</span>
            <strong className="abs-sticky-value">{model ? model.totalMarkdown : '—'}</strong>
            <span className="abs-sticky-hint">
              {model ? t('dashboard.stats.excluded', { count: model.excludedCount }) : t('dashboard.stats.reading')}
            </span>
          </div>
          <div className="abs-sticky bg-butter rotate-[0.5deg]">
            <span className="abs-sticky-label">{t('dashboard.stats.drafts')}</span>
            <strong className="abs-sticky-value">{statsLoading ? '—' : drafts}</strong>
            <span className="abs-sticky-hint">
              {isSyncing
                ? t('dashboard.summary.syncing', {
                    done: content.progress.done,
                    total: content.progress.total || content.indexed,
                  })
                : t('dashboard.stats.basedOn', { count: content.indexed })}
            </span>
          </div>
          <div className="abs-sticky bg-blush rotate-[-0.3deg]">
            <span className="abs-sticky-label">{t('dashboard.stats.encrypted')}</span>
            <strong className="abs-sticky-value">{statsLoading ? '—' : encrypted}</strong>
            <span className="abs-sticky-hint">
              {isSyncing
                ? t('dashboard.summary.syncing', {
                    done: content.progress.done,
                    total: content.progress.total || content.indexed,
                  })
                : t('dashboard.stats.basedOn', { count: content.indexed })}
            </span>
          </div>
        </section>

        <section className="abs-sheet mt-4 min-w-0 px-4 pb-2 pt-5">
          <span className="abs-tape" aria-hidden />
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-line pb-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="font-display text-[16px] font-bold">
                {listMode === 'posts' ? t('dashboard.list.recent') : t('dashboard.list.drafts')}
              </h2>
              {listMode === 'drafts' ? (
                <span className="font-mono text-[9.5px] text-muted">
                  {draftBox.status === 'loading'
                    ? t('dashboard.list.loading')
                    : t('dashboard.list.draftsMeta', { count: draftBox.items.length })}
                </span>
              ) : null}
            </div>
            {listMode === 'posts' ? (
              <div className="flex flex-wrap items-center gap-2">
                <fieldset className="abs-seg" aria-label={t('dashboard.list.sortLabel')}>
                  <legend className="sr-only">{t('dashboard.list.sortLabel')}</legend>
                  <button
                    type="button"
                    title={t('dashboard.list.sortUpdated')}
                    aria-pressed={sortKey === 'updated'}
                    onClick={() => changeSort('updated')}
                  >
                    updated
                  </button>
                  <button
                    type="button"
                    title={t('dashboard.list.sortDate')}
                    aria-pressed={sortKey === 'date'}
                    onClick={() => changeSort('date')}
                  >
                    date
                  </button>
                </fieldset>
                <span className="font-mono text-[9.5px] text-muted">{summaryLabel}</span>
              </div>
            ) : (
              <span className="font-mono text-[9.5px] text-muted">
                {mode === 'demo' ? t('dashboard.list.demoPlain') : t('dashboard.list.encrypted')}
              </span>
            )}
          </div>

          {listMode === 'drafts' ? (
            <DraftsList
              status={draftBox.status}
              items={draftBox.items}
              error={draftBox.error}
              timezone={config.timezone}
              onOpen={(draft) => void openDraft(draft)}
              onRemove={(draft) => void removeDraftItem(draft)}
              onNew={() => setDialog(true)}
              onRetry={() => void loadDrafts(repoKey)}
            />
          ) : (
            <>
              {content.visibleTotal > content.indexed ? (
                <p className="mt-2 text-[10px] leading-relaxed text-muted">
                  {t('dashboard.list.truncated', { total: content.visibleTotal, indexed: content.indexed })}
                </p>
              ) : null}
              {!isSyncing && content.skipped > 0 ? (
                <p className="mt-1 text-[10px] leading-relaxed text-muted">
                  {t('dashboard.list.skipped', { count: content.skipped })}
                </p>
              ) : null}

              {isLoadingFirst && recent.length === 0 ? (
                <div className="py-4">
                  <SkeletonList rows={5} />
                </div>
              ) : recent.length > 0 ? (
                <ul>
                  {recent.map((post) => (
                    <li key={post.path}>
                      <button
                        type="button"
                        className="group grid w-full grid-cols-[64px_minmax(0,1fr)] items-center gap-2.5 border-b border-dotted border-line px-1 py-2.5 text-left last:border-b-0 hover:bg-blush-2 sm:grid-cols-[64px_minmax(0,1fr)_auto]"
                        onClick={() => navigate(`/edit?path=${encodeURIComponent(post.path)}`)}
                      >
                        <span className="whitespace-nowrap font-mono text-[9.5px] text-muted">
                          {displayDate(postSortValue(post, sortKey))}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-bold group-hover:text-sakura">{post.title}</span>
                          <span className="block truncate font-mono text-[9px] text-muted">{post.path}</span>
                        </span>
                        <span className="col-span-2 flex flex-wrap justify-start gap-1 pl-[72px] sm:col-span-1 sm:pl-0">
                          {post.draft ? <Badge tone="butter">{t('dashboard.list.badges.draft')}</Badge> : null}
                          {post.sticky ? <Badge tone="mint">{t('dashboard.list.badges.sticky')}</Badge> : null}
                          {post.encrypted ? <Badge tone="blush">{t('dashboard.list.badges.encrypted')}</Badge> : null}
                          {post.frontmatterError ? <Badge tone="ghost">{t('dashboard.list.badges.yaml')}</Badge> : null}
                          {post.categories[0] ? <Badge tone="ghost">{post.categories[0]}</Badge> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : !model || model.files.length === 0 ? (
                <div className="py-6">
                  <EmptyState
                    title={t('dashboard.list.emptyTitle')}
                    action={
                      <Link to="/settings" className="abs-btn abs-btn-ghost h-8 text-[11px]">
                        {t('dashboard.list.emptyAction')}
                      </Link>
                    }
                  >
                    {t('dashboard.list.emptyBody', { rootDir: config.rootDir })}
                  </EmptyState>
                </div>
              ) : (
                <p className="py-8 text-center text-[11.5px] text-muted">
                  {t('dashboard.list.pending', { count: model.totalMarkdown })}
                </p>
              )}

              {hasMore ? (
                <div className="flex flex-col items-center gap-1.5 py-3">
                  <button type="button" className="abs-btn abs-btn-ghost h-8 text-[11px]" onClick={loadMore}>
                    <ChevronDown aria-hidden className="size-3.5" />
                    {t('dashboard.list.loadMore')}
                  </button>
                  <span aria-live="polite" className="font-mono text-[9px] text-muted">
                    {t('dashboard.list.shown', { shown: recent.length, total: sorted.length, page: RECENT_PAGE_SIZE })}
                  </span>
                </div>
              ) : sorted.length > RECENT_PAGE_SIZE ? (
                <p aria-live="polite" className="py-2 text-center font-mono text-[9px] text-muted">
                  {t('dashboard.list.allShown', { count: sorted.length })}
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-3">
        <div className="abs-receipt">
          <div className="flex items-center justify-between gap-2">
            <span className="font-body text-[11.5px] font-bold">{t('dashboard.receipt.title')}</span>
            <span className="rotate-[-4deg] rounded border border-sakura px-1.5 py-0.5 font-mono text-[8px] text-sakura">
              {lastCommit ? t('dashboard.receipt.archived') : t('dashboard.receipt.waiting')}
            </span>
          </div>
          {lastCommit ? (
            <>
              <div className="mt-2 flex gap-2 border-b border-dashed border-line py-1.5">
                <span className="shrink-0 text-muted">msg</span>
                <code className="break-all text-ink">{lastCommit.message}</code>
              </div>
              <div className="flex gap-2 border-b border-dashed border-line py-1.5">
                <span className="shrink-0 text-muted">path</span>
                <code className="break-all text-ink">{lastCommit.path}</code>
              </div>
              <div className="flex gap-2 border-b border-dashed border-line py-1.5">
                <span className="shrink-0 text-muted">sha</span>
                <code className="text-ink">{lastCommit.sha.slice(0, 10)}</code>
              </div>
              <div className="mt-2 flex items-center justify-between text-muted">
                <span>{new Date(lastCommit.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
                {lastCommit.htmlUrl ? (
                  <a
                    href={lastCommit.htmlUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sakura underline decoration-dashed underline-offset-2"
                  >
                    {t('dashboard.receipt.view')}
                  </a>
                ) : (
                  <span>in-memory</span>
                )}
              </div>
            </>
          ) : (
            <p className="mt-2 text-[10px] leading-relaxed text-muted">{t('dashboard.receipt.empty')}</p>
          )}
        </div>

        <div className="relative rotate-[0.6deg] rounded-[14px] border-[1.5px] border-edge bg-butter px-3.5 pb-3.5 pt-4 shadow-sticker">
          <span className="abs-tape abs-tape-mint" aria-hidden />
          <h2 className="font-display text-[15px] font-bold">{t('dashboard.goals.title')}</h2>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
            <li className="flex items-start gap-2">
              <Check
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 rounded-[3px] border border-edge bg-mint p-0.5 text-accent-edge"
              />
              {t('dashboard.goals.item1')}
            </li>
            <li className="flex items-start gap-2">
              <Check
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 rounded-[3px] border border-edge bg-mint p-0.5 text-accent-edge"
              />
              {t('dashboard.goals.item2')}
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-3.5 shrink-0 rounded-[3px] border border-edge bg-paper" />
              {t('dashboard.goals.item3')}
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-[9.5px] text-ink-soft">
          <div className="flex items-center justify-between gap-2 py-0.5">
            <span>GitHub API</span>
            <strong className="font-medium">
              {rate.remaining.toLocaleString(locale)} / {rate.limit.toLocaleString(locale)}
            </strong>
          </div>
          <div className="my-1.5 h-1.5 overflow-hidden rounded-full border border-edge/20 bg-blush-2">
            <span
              className="abs-progress"
              style={{ width: `${rate.limit ? Math.min(100, Math.round((rate.remaining / rate.limit) * 100)) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 py-0.5">
            <span>{t('dashboard.cache.local')}</span>
            <strong className="font-medium">
              {mode === 'demo' ? t('dashboard.cache.memory') : t('dashboard.cache.entries', { count: content.cachedCount })}
            </strong>
          </div>
          <div className="flex items-center justify-between gap-2 py-0.5">
            <span>{t('dashboard.cache.branch')}</span>
            <strong className="font-medium">{repo.defaultBranch}</strong>
          </div>
          <div className="flex items-center justify-between gap-2 py-0.5">
            <span>{t('dashboard.cache.mode')}</span>
            <strong className="font-medium">{mode === 'demo' ? t('dashboard.cache.demo') : t('dashboard.cache.live')}</strong>
          </div>
        </div>

        <div className="flex items-center gap-2 px-1 text-[10px] text-muted">
          <Clock3 aria-hidden className="size-3" />
          {t('dashboard.speedHint')}
        </div>
        <Link
          to="/settings"
          className="flex items-center gap-1 px-1 text-[10px] text-sakura underline decoration-dashed underline-offset-2"
        >
          {t('dashboard.settingsLink')}
          <ArrowUpRight aria-hidden className="size-3" />
        </Link>
      </aside>

      <NewPostDialog open={openDialog} onOpenChange={setDialog} model={model} />
    </div>
  );
}

function DraftsList({
  status,
  items,
  error,
  timezone,
  onOpen,
  onRemove,
  onNew,
  onRetry,
}: {
  status: DraftsStatus;
  items: DraftBoxItem[];
  error: string | null;
  timezone: string;
  onOpen: (draft: DraftBoxItem) => void;
  onRemove: (draft: DraftBoxItem) => void;
  onNew: () => void;
  onRetry: () => void;
}) {
  const t = useT();
  const locale = useActiveLocale();
  if (status === 'loading' && items.length === 0) {
    return (
      <div className="py-4">
        <SkeletonList rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-6 text-center">
        <p className="text-[11.5px] text-danger">{error}</p>
        <button type="button" className="abs-btn abs-btn-ghost mt-2 h-7 px-2.5 text-[10px]" onClick={onRetry}>
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-6">
        <EmptyState
          title={t('dashboard.drafts.emptyTitle')}
          action={
            <button type="button" className="abs-btn abs-btn-ghost h-8 text-[11px]" onClick={onNew}>
              <Plus aria-hidden className="size-3.5" />
              {t('dashboard.actions.newPost')}
            </button>
          }
        >
          {t('dashboard.drafts.emptyBody')}
        </EmptyState>
      </div>
    );
  }

  return (
    <ul>
      {items.map((draft) => (
        <li
          key={`${draft.repoKey}\u0000${draft.path}`}
          className="flex items-stretch gap-1 border-b border-dotted border-line last:border-b-0 hover:bg-blush-2"
        >
          <button
            type="button"
            className="group grid min-w-0 flex-1 grid-cols-[64px_minmax(0,1fr)] items-center gap-2.5 px-1 py-2.5 text-left sm:grid-cols-[64px_minmax(0,1fr)_auto]"
            onClick={() => onOpen(draft)}
          >
            <span className="whitespace-nowrap font-mono text-[9.5px] text-muted">
              {displayDate(formatInTimeZone(new Date(draft.savedAt), timezone))}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-bold group-hover:text-sakura">{draft.title}</span>
              <span className="block truncate font-mono text-[9px] text-muted">{draft.path}</span>
            </span>
            <span className="col-span-2 flex flex-wrap items-center gap-1 pl-[72px] sm:col-span-1 sm:pl-0">
              {draft.isNew ? (
                <Badge tone="butter">{t('dashboard.drafts.badges.new')}</Badge>
              ) : (
                <Badge tone="ghost">{t('dashboard.drafts.badges.existing')}</Badge>
              )}
              {draft.origin === 'backup' ? <Badge tone="ghost">{t('dashboard.drafts.badges.backup')}</Badge> : null}
              {draft.mode === 'source' ? (
                <Badge tone="ghost">
                  {isMarkdownDocument(draft.path) ? t('dashboard.drafts.badges.source') : t('dashboard.drafts.badges.plain')}
                </Badge>
              ) : null}
              <span className="font-mono text-[9px] text-muted">
                {t('common.units.words', { count: draftCharCount(draft.text).toLocaleString(locale) })}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="abs-icon-btn my-auto mr-1 size-7 shrink-0 border-transparent bg-transparent text-muted hover:border-danger/40 hover:bg-transparent hover:text-danger"
            aria-label={t('dashboard.drafts.removeAria', { title: draft.title })}
            title={t('dashboard.drafts.removeAction')}
            onClick={() => onRemove(draft)}
          >
            <Trash2 aria-hidden className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
