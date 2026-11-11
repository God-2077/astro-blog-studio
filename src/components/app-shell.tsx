import { Github, LockKeyhole, Menu, Plus, RefreshCw, Settings, Sparkles, X } from 'lucide-react';
import { type MouseEvent, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { confirmAction } from '@/components/confirm-toast';
import { TreePanel } from '@/components/tree-panel';
import { useAutoLock } from '@/hooks/use-auto-lock';
import { useContentActions, useContentSync } from '@/hooks/use-content-sync';
import { useTreeModel } from '@/hooks/use-data';
import { APP_NAME, APP_URL, APP_VERSION } from '@/lib/config/app-meta';
import { useGateway } from '@/lib/gateway/context';
import { useActiveLocale, useT } from '@/lib/i18n/react';
import { unlockReturnState } from '@/lib/navigation/unlock-return';
import { cn } from '@/lib/utils/cn';
import { useContent } from '@/stores/content';
import { useEditorGuard } from '@/stores/editor';
import { usePwaUpdate } from '@/stores/pwa';
import { useRateLimit } from '@/stores/rate-limit';
import { useUi } from '@/stores/ui';
import { useVault } from '@/stores/vault';

export function AppShell() {
  const t = useT();
  const locale = useActiveLocale();
  const { mode, repo } = useGateway();
  const { tree, model } = useTreeModel();
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarOpen = useUi((state) => state.sidebarOpen);
  const setSidebarOpen = useUi((state) => state.setSidebarOpen);
  const rate = useRateLimit();
  const lock = useVault((state) => state.lock);
  const vaultMode = useVault((state) => state.mode);
  const dirty = useEditorGuard((state) => state.dirty);
  const updateReady = usePwaUpdate((state) => state.needRefresh);
  const reopenUpdate = usePwaUpdate((state) => state.reopenPrompt);
  const cachedCount = useContent((state) => state.cachedCount);
  const { checkNow, pending: contentPending } = useContentActions();
  const activePath = new URLSearchParams(location.search).get('path');

  // Load the encrypted local article cache once, then reconcile it with HEAD.
  useContentSync();

  const confirmLeave = async (): Promise<boolean> =>
    !dirty ||
    (await confirmAction(t('shell.leave.title'), {
      confirmLabel: t('shell.leave.confirm'),
      cancelLabel: t('shell.leave.cancel'),
      danger: true,
    }));

  // 未保存时同步 preventDefault 挡住 <Link> 的默认跳转，等确认后再 navigate；
  // 带修饰键或中键仍交给浏览器（新标签页打开），不改原生行为。
  const guardLeave =
    (to: string) =>
    (event: MouseEvent<HTMLAnchorElement>): void => {
      if (!dirty) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void confirmLeave().then((leave) => {
        if (leave) navigate(to);
      });
    };

  useAutoLock(mode === 'live' && vaultMode === 'password');

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer whenever the route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, location.search, setSidebarOpen]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (window.innerWidth < 1024) setSidebarOpen(true);
        window.setTimeout(() => document.getElementById('tree-search')?.focus(), 60);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSidebarOpen]);

  const handleLock = async (): Promise<void> => {
    await lock();
    navigate('/unlock', { state: unlockReturnState(location) });
  };

  const retryTree = (): void => {
    void tree.refetch();
  };

  return (
    <div className="abs-shell">
      <header className="abs-topbar">
        <button
          type="button"
          className="abs-icon-btn lg:hidden"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? t('shell.nav.toggleSidebar.close') : t('shell.nav.toggleSidebar.open')}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
        </button>

        <button
          type="button"
          className="abs-brand text-left"
          onClick={() => {
            void confirmLeave().then((leave) => {
              if (leave) navigate('/');
            });
          }}
          aria-label={t('shell.nav.home')}
        >
          <span className="abs-seal" aria-hidden>
            樱
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[15px] font-bold leading-tight tracking-wide">studio</span>
            <span className="block truncate font-mono text-[9px] text-muted">
              {repo.owner}/{repo.name} · {repo.defaultBranch}
            </span>
          </span>
        </button>

        {mode === 'demo' ? (
          <span className="abs-badge abs-badge-blush">
            <Sparkles aria-hidden className="size-3" />
            {t('shell.demo.badge')}
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            to="/?new=1"
            onClick={guardLeave('/?new=1')}
            className="abs-btn abs-btn-primary hidden h-8 px-3 text-[11px] sm:inline-flex"
          >
            <Plus aria-hidden className="size-3.5" />
            {t('shell.nav.newPost')}
          </Link>
          <Link
            to="/settings"
            onClick={guardLeave('/settings')}
            className="abs-icon-btn"
            aria-label={t('shell.nav.settings')}
            title={t('shell.nav.settings')}
          >
            <Settings aria-hidden className="size-3.5" />
          </Link>
          {updateReady ? (
            <button
              type="button"
              className="abs-icon-btn relative"
              onClick={reopenUpdate}
              aria-label={t('shell.nav.update.aria')}
              title={t('shell.nav.update.title')}
            >
              <RefreshCw aria-hidden className="size-3.5" />
              <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-sakura" />
            </button>
          ) : null}
          {mode === 'live' ? (
            <button
              type="button"
              className="abs-icon-btn"
              onClick={() => void handleLock()}
              aria-label={t('shell.nav.lock')}
              title={t('shell.nav.lock')}
            >
              <LockKeyhole aria-hidden className="size-3.5" />
            </button>
          ) : (
            <a
              className="abs-icon-btn"
              href={repo.htmlUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={t('shell.nav.githubRepo')}
              title={t('shell.nav.githubRepo')}
            >
              <Github aria-hidden className="size-3.5" />
            </a>
          )}
        </div>
      </header>

      {mode === 'demo' ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line bg-paper/70 px-3 py-2 text-[10.5px] text-ink-soft">
          <span>{t('shell.demo.banner')}</span>
          <div className="flex items-center gap-3">
            <Link
              to="/settings"
              onClick={guardLeave('/settings')}
              className="underline decoration-line underline-offset-2 hover:text-sakura"
            >
              {t('shell.demo.settings')}
            </Link>
            <button
              type="button"
              className="font-semibold text-sakura underline decoration-dashed underline-offset-2"
              onClick={() => window.location.assign(window.location.pathname)}
            >
              {t('shell.demo.exit')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[252px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 lg:block">
          <div className="sticky top-[76px] h-[calc(100vh-96px)]">
            <TreePanel
              model={model}
              activePath={activePath}
              isLoading={tree.isLoading}
              refreshing={contentPending}
              error={tree.error}
              onRetry={retryTree}
              onRefresh={() => void checkNow()}
            />
          </div>
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 px-1 pt-3 font-mono text-[9.5px] text-muted">
        <span className="flex items-center gap-2">
          <span className={cn('inline-block size-1.5 rounded-full', tree.isError ? 'bg-danger' : 'bg-success')} />
          {mode === 'demo' ? t('shell.footer.demoMode') : t('shell.footer.liveMode')}
          {mode === 'live' && cachedCount > 0 ? ` · ${t('shell.footer.cached', { count: cachedCount })}` : ''}
        </span>
        <span>
          API {rate.remaining.toLocaleString(locale)} / {rate.limit.toLocaleString(locale)} ·{' '}
          {rate.limit ? Math.round((rate.remaining / rate.limit) * 100) : 0}%
        </span>
        <a
          className="underline decoration-line underline-offset-2 hover:text-sakura"
          href={APP_URL}
          target="_blank"
          rel="noreferrer noopener"
          title={t('shell.nav.projectSource')}
        >
          {APP_NAME} v{APP_VERSION}
        </a>
      </footer>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--abs-overlay)] backdrop-blur-[2px]"
            aria-label={t('shell.nav.closeSidebar')}
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(86vw,320px)] p-3">
            <TreePanel
              model={model}
              activePath={activePath}
              isLoading={tree.isLoading}
              refreshing={contentPending}
              error={tree.error}
              onRetry={retryTree}
              onRefresh={() => void checkNow()}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
