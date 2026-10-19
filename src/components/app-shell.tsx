import { Github, LockKeyhole, Menu, Plus, RefreshCw, Settings, Sparkles, X } from 'lucide-react';
import { type MouseEvent, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TreePanel } from '@/components/tree-panel';
import { useAutoLock } from '@/hooks/use-auto-lock';
import { useContentActions, useContentSync } from '@/hooks/use-content-sync';
import { useTreeModel } from '@/hooks/use-data';
import { APP_NAME, APP_URL, APP_VERSION } from '@/lib/config/app-meta';
import { useGateway } from '@/lib/gateway/context';
import { cn } from '@/lib/utils/cn';
import { useContent } from '@/stores/content';
import { useEditorGuard } from '@/stores/editor';
import { usePwaUpdate } from '@/stores/pwa';
import { useRateLimit } from '@/stores/rate-limit';
import { useUi } from '@/stores/ui';
import { useVault } from '@/stores/vault';

export function AppShell() {
  const { mode, repo } = useGateway();
  const { tree, model } = useTreeModel();
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarOpen = useUi((state) => state.sidebarOpen);
  const setSidebarOpen = useUi((state) => state.setSidebarOpen);
  const rate = useRateLimit();
  const lock = useVault((state) => state.lock);
  const dirty = useEditorGuard((state) => state.dirty);
  const updateReady = usePwaUpdate((state) => state.needRefresh);
  const reopenUpdate = usePwaUpdate((state) => state.reopenPrompt);
  const cachedCount = useContent((state) => state.cachedCount);
  const { checkNow, pending: contentPending } = useContentActions();
  const activePath = new URLSearchParams(location.search).get('path');

  // Load the encrypted local article cache once, then reconcile it with HEAD.
  useContentSync();

  const confirmLeave = (): boolean => !dirty || window.confirm('当前文章有未保存的修改，确定离开吗？');
  const guardLeave = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!confirmLeave()) event.preventDefault();
  };

  useAutoLock(mode === 'live');

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
    navigate('/unlock');
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
          aria-label={sidebarOpen ? '收起文件索引' : '打开文件索引'}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
        </button>

        <button
          type="button"
          className="abs-brand text-left"
          onClick={() => {
            if (confirmLeave()) navigate('/');
          }}
          aria-label="回到工作台"
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
            演示模式
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            to="/?new=1"
            onClick={guardLeave}
            className="abs-btn abs-btn-primary hidden h-8 px-3 text-[11px] sm:inline-flex"
          >
            <Plus aria-hidden className="size-3.5" />
            新建
          </Link>
          <Link to="/settings" onClick={guardLeave} className="abs-icon-btn" aria-label="设置" title="设置">
            <Settings aria-hidden className="size-3.5" />
          </Link>
          {updateReady ? (
            <button
              type="button"
              className="abs-icon-btn relative"
              onClick={reopenUpdate}
              aria-label="有新版本，查看更新提示"
              title="有新版本"
            >
              <RefreshCw aria-hidden className="size-3.5" />
              <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-sakura" />
            </button>
          ) : null}
          {mode === 'live' ? (
            <button type="button" className="abs-icon-btn" onClick={() => void handleLock()} aria-label="锁定" title="锁定">
              <LockKeyhole aria-hidden className="size-3.5" />
            </button>
          ) : (
            <a
              className="abs-icon-btn"
              href={repo.htmlUrl}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="在 GitHub 打开仓库"
              title="在 GitHub 打开仓库"
            >
              <Github aria-hidden className="size-3.5" />
            </a>
          )}
        </div>
      </header>

      {mode === 'demo' ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line bg-paper/70 px-3 py-2 text-[10.5px] text-ink-soft">
          <span>演示模式：示例仓库只在内存里，不会连接 GitHub；未保存备份保存在本机演示键。刷新后恢复初始示例。</span>
          <div className="flex items-center gap-3">
            <Link
              to="/settings"
              onClick={guardLeave}
              className="underline decoration-line underline-offset-2 hover:text-sakura"
            >
              看设置
            </Link>
            <button
              type="button"
              className="font-semibold text-sakura underline decoration-dashed underline-offset-2"
              onClick={() => window.location.assign(window.location.pathname)}
            >
              退出演示 / 连接真实仓库
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
          {mode === 'demo' ? 'in-memory fixture' : 'github.com · content repo'}
          {mode === 'live' && cachedCount > 0 ? ` · 缓存 ${cachedCount} 篇` : ''}
        </span>
        <span>
          API {rate.remaining.toLocaleString('en-US')} / {rate.limit.toLocaleString('en-US')} ·{' '}
          {rate.limit ? Math.round((rate.remaining / rate.limit) * 100) : 0}%
        </span>
        <a
          className="underline decoration-line underline-offset-2 hover:text-sakura"
          href={APP_URL}
          target="_blank"
          rel="noreferrer noopener"
          title="在 GitHub 打开项目源码"
        >
          {APP_NAME} v{APP_VERSION}
        </a>
      </footer>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--abs-overlay)] backdrop-blur-[2px]"
            aria-label="关闭文件索引"
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
