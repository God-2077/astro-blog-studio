import { ArrowUpRight, Check, Clock3, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { NewPostDialog } from '@/components/new-post-dialog';
import { Badge, EmptyState, ErrorNote, SkeletonList } from '@/components/ui';
import { usePostSummaries, useTreeModel } from '@/hooks/use-data';
import { useGateway } from '@/lib/gateway/context';
import { displayDate } from '@/lib/utils/date';
import { useLastCommit } from '@/stores/last-commit';
import { useRateLimit } from '@/stores/rate-limit';

export function DashboardPage() {
  const { mode, config, repo } = useGateway();
  const { tree, model } = useTreeModel();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const lastCommit = useLastCommit((state) => state.commit);
  const rate = useRateLimit();

  const paths = useMemo(() => (model ? model.files.map((file) => file.path) : []), [model]);
  const {
    summaries,
    isLoading: summariesLoading,
    isError: summariesError,
    error: summariesErrorDetail,
    refetch: refetchSummaries,
    scanned,
  } = usePostSummaries(paths, 12, tree.data?.sha);

  const sorted = useMemo(
    () => [...summaries].sort((a, b) => (b.updated ?? b.date).localeCompare(a.updated ?? a.date)),
    [summaries],
  );
  const drafts = summaries.filter((item) => item.draft).length;
  const encrypted = summaries.filter((item) => item.encrypted).length;
  const scanLimit = Math.min(12, model?.files.length ?? 0);
  const today = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full', timeZone: config.timezone }).format(new Date());

  const openDialog = params.get('new') === '1' || dialogOpen;
  const setDialog = (open: boolean): void => {
    setDialogOpen(open);
    if (!open && params.get('new')) {
      const next = new URLSearchParams(params);
      next.delete('new');
      setParams(next, { replace: true });
    }
  };

  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <section className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-sakura">
              {mode === 'demo' ? 'demo workspace' : 'workspace'}
            </p>
            <h1 className="mt-1 font-display text-[clamp(26px,3vw,36px)] font-bold leading-tight">今天写点什么？</h1>
            <p className="mt-1 text-[11px] text-muted">
              {today} · {repo.owner}/{repo.name} · {config.rootDir}
            </p>
          </div>
          <button type="button" className="abs-btn abs-btn-primary" onClick={() => setDialog(true)}>
            <Plus aria-hidden className="size-3.5" />
            新建文章
          </button>
        </section>

        {tree.error ? <ErrorNote error={tree.error} onRetry={() => void tree.refetch()} className="mt-4" /> : null}
        {summariesError ? (
          <ErrorNote
            error={summariesErrorDetail ?? new Error('frontmatter 读取失败')}
            onRetry={() => void refetchSummaries()}
            className="mt-3"
          />
        ) : null}

        <section className="mt-4 grid grid-cols-3 gap-2 sm:gap-2.5" aria-label="统计">
          <div className="abs-sticky bg-mint-2 rotate-[-0.7deg]">
            <span className="abs-sticky-label">全部文章</span>
            <strong className="abs-sticky-value">{model ? model.totalMarkdown : '—'}</strong>
            <span className="abs-sticky-hint">{model ? `${model.excludedCount} 个被排除` : '读取文件树中'}</span>
          </div>
          <div className="abs-sticky bg-butter rotate-[0.5deg]">
            <span className="abs-sticky-label">草稿</span>
            <strong className="abs-sticky-value">{summariesLoading ? '—' : drafts}</strong>
            <span className="abs-sticky-hint">基于已扫描的 {scanned} 篇</span>
          </div>
          <div className="abs-sticky bg-blush rotate-[-0.3deg]">
            <span className="abs-sticky-label">加密</span>
            <strong className="abs-sticky-value">{summariesLoading ? '—' : encrypted}</strong>
            <span className="abs-sticky-hint">发布时需输入密码</span>
          </div>
        </section>

        <section className="abs-sheet mt-4 min-w-0 px-4 pb-2 pt-5">
          <span className="abs-tape" aria-hidden />
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-dashed border-line pb-2">
            <h2 className="font-display text-[16px] font-bold">最近动过</h2>
            <span className="font-mono text-[9.5px] text-muted">
              {scanned ? `已扫描 ${scanned} / ${scanLimit}` : '读取 frontmatter'}
            </span>
          </div>

          {tree.isLoading || (summariesLoading && !sorted.length) ? (
            <div className="py-4">
              <SkeletonList rows={5} />
            </div>
          ) : !model || model.files.length === 0 ? (
            <div className="py-6">
              <EmptyState
                title="还没有 Markdown 文件"
                action={
                  <Link to="/settings" className="abs-btn abs-btn-ghost h-8 text-[11px]">
                    检查根目录与排除规则
                  </Link>
                }
              >
                当前根目录 {config.rootDir} 下没有可见的 .md / .mdx。也可能是排除规则把内容全部隐藏了。
              </EmptyState>
            </div>
          ) : sorted.length === 0 ? (
            <p className="py-8 text-center text-[11.5px] text-muted">
              文件树里有 {model.totalMarkdown} 个文件，但还没读到 frontmatter。
            </p>
          ) : (
            <ul>
              {sorted.map((post) => (
                <li key={post.path}>
                  <button
                    type="button"
                    className="group grid w-full grid-cols-[64px_minmax(0,1fr)] items-center gap-2.5 border-b border-dotted border-line px-1 py-2.5 text-left last:border-b-0 hover:bg-blush-2 sm:grid-cols-[64px_minmax(0,1fr)_auto]"
                    onClick={() => navigate(`/edit?path=${encodeURIComponent(post.path)}`)}
                  >
                    <span className="whitespace-nowrap font-mono text-[9.5px] text-muted">
                      {displayDate(post.updated ?? post.date)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-bold group-hover:text-sakura">{post.title}</span>
                      <span className="block truncate font-mono text-[9px] text-muted">{post.path}</span>
                    </span>
                    <span className="col-span-2 flex flex-wrap justify-start gap-1 pl-[72px] sm:col-span-1 sm:pl-0">
                      {post.draft ? <Badge tone="butter">草稿</Badge> : null}
                      {post.sticky ? <Badge tone="mint">置顶</Badge> : null}
                      {post.encrypted ? <Badge tone="blush">加密</Badge> : null}
                      {post.frontmatterError ? <Badge tone="ghost">YAML 异常</Badge> : null}
                      {post.categories[0] ? <Badge tone="ghost">{post.categories[0]}</Badge> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-3">
        <div className="abs-receipt">
          <div className="flex items-center justify-between gap-2">
            <span className="font-body text-[11.5px] font-bold">提交小票</span>
            <span className="rotate-[-4deg] rounded border border-sakura px-1.5 py-0.5 font-mono text-[8px] text-sakura">
              {lastCommit ? '已归档' : '等待'}
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
                <span>{new Date(lastCommit.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                {lastCommit.htmlUrl ? (
                  <a
                    href={lastCommit.htmlUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sakura underline decoration-dashed underline-offset-2"
                  >
                    查看提交 ↗
                  </a>
                ) : (
                  <span>in-memory</span>
                )}
              </div>
            </>
          ) : (
            <p className="mt-2 text-[10px] leading-relaxed text-muted">保存第一篇文章后，这里会出现一条提交小票。</p>
          )}
        </div>

        <div className="relative rotate-[0.6deg] rounded-[14px] border-[1.5px] border-edge bg-butter px-3.5 pb-3.5 pt-4 shadow-sticker">
          <span className="abs-tape abs-tape-mint" aria-hidden />
          <h2 className="font-display text-[15px] font-bold">今日小目标</h2>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
            <li className="flex items-start gap-2">
              <Check
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 rounded-[3px] border border-edge bg-mint p-0.5 text-accent-edge"
              />
              补完 Markdown 备忘单的表格一节
            </li>
            <li className="flex items-start gap-2">
              <Check
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 rounded-[3px] border border-edge bg-mint p-0.5 text-accent-edge"
              />
              把读书笔记草稿改成发布
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 size-3.5 shrink-0 rounded-[3px] border border-edge bg-paper" />
              给旧便笺补 updated
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-[9.5px] text-ink-soft">
          <div className="flex items-center justify-between gap-2 py-0.5">
            <span>GitHub API</span>
            <strong className="font-medium">
              {rate.remaining.toLocaleString('en-US')} / {rate.limit.toLocaleString('en-US')}
            </strong>
          </div>
          <div className="my-1.5 h-1.5 overflow-hidden rounded-full border border-edge/20 bg-blush-2">
            <span
              className="abs-progress"
              style={{ width: `${rate.limit ? Math.min(100, Math.round((rate.remaining / rate.limit) * 100)) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 py-0.5">
            <span>分支</span>
            <strong className="font-medium">{repo.defaultBranch}</strong>
          </div>
          <div className="flex items-center justify-between gap-2 py-0.5">
            <span>模式</span>
            <strong className="font-medium">{mode === 'demo' ? '内存演示' : '真实仓库'}</strong>
          </div>
        </div>

        <div className="flex items-center gap-2 px-1 text-[10px] text-muted">
          <Clock3 aria-hidden className="size-3" />
          从打开页面到保存一次修改，目标 &lt; 30 秒。
        </div>
        <Link
          to="/settings"
          className="flex items-center gap-1 px-1 text-[10px] text-sakura underline decoration-dashed underline-offset-2"
        >
          连接与提交设置
          <ArrowUpRight aria-hidden className="size-3" />
        </Link>
      </aside>

      <NewPostDialog open={openDialog} onOpenChange={setDialog} model={model} />
    </div>
  );
}
