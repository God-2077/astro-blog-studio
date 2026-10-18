import { ChevronDown, ChevronRight, FileText, Folder, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorNote, SkeletonList } from '@/components/ui';
import type { TreeModel, TreeNode } from '@/lib/tree/model';
import { useEditorGuard } from '@/stores/editor';
import { useUi } from '@/stores/ui';

function countFiles(node: TreeNode): number {
  if (node.type === 'file') return 1;
  return node.children.reduce((sum, child) => sum + countFiles(child), 0);
}

function initialCollapsed(nodes: TreeNode[], depth = 0): Set<string> {
  const set = new Set<string>();
  const visit = (list: TreeNode[], currentDepth: number): void => {
    for (const node of list) {
      if (node.type !== 'folder') continue;
      if (currentDepth >= 2) set.add(node.path);
      visit(node.children, currentDepth + 1);
    }
  };
  visit(nodes, depth);
  return set;
}

interface TreePanelProps {
  model: TreeModel | null;
  activePath: string | null;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onRefresh: () => void;
}

export function TreePanel({ model, activePath, isLoading, error, onRetry, onRefresh }: TreePanelProps) {
  const navigate = useNavigate();
  const setSidebarOpen = useUi((state) => state.setSidebarOpen);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null);

  const defaultCollapsed = useMemo(() => initialCollapsed(model?.nodes ?? []), [model?.nodes]);
  const effectiveCollapsed = collapsed ?? defaultCollapsed;

  const filtered = useMemo(() => {
    if (!model || !query.trim()) return null;
    const needle = query.trim().toLowerCase();
    return model.files.filter((file) => file.path.toLowerCase().includes(needle) || file.name.toLowerCase().includes(needle));
  }, [model, query]);

  const openFile = (path: string): void => {
    if (path !== activePath && useEditorGuard.getState().dirty && !window.confirm('当前文章有未保存的修改，确定离开吗？'))
      return;
    navigate(`/edit?path=${encodeURIComponent(path)}`);
    setSidebarOpen(false);
  };

  const toggle = (path: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous ?? defaultCollapsed);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (node.type === 'folder') {
      const isCollapsed = effectiveCollapsed.has(node.path);
      return (
        <li key={node.path}>
          <button
            type="button"
            className="abs-tree-row"
            onClick={() => toggle(node.path)}
            aria-expanded={!isCollapsed}
            style={{ paddingLeft: `${7 + depth * 12}px` }}
          >
            {isCollapsed ? (
              <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted" />
            ) : (
              <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted" />
            )}
            <Folder aria-hidden className="size-3.5 shrink-0 text-sakura" />
            <span className="truncate">{node.name}</span>
            <span className="ml-auto font-mono text-[9px] text-muted">{countFiles(node)}</span>
          </button>
          {!isCollapsed ? <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul> : null}
        </li>
      );
    }

    return (
      <li key={node.path}>
        <button
          type="button"
          className="abs-tree-row"
          data-selected={activePath === node.path ? 'true' : 'false'}
          onClick={() => openFile(node.path)}
          title={node.path}
          style={{ paddingLeft: `${7 + depth * 12}px` }}
        >
          <FileText aria-hidden className="size-3.5 shrink-0 text-muted" />
          <span className="truncate">{node.name}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="abs-paper flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">索引卡</span>
        <span className="font-mono text-[10px] text-muted">{model ? `${model.totalMarkdown} 篇` : '—'}</span>
        <button
          type="button"
          className="abs-icon-btn ml-auto size-7"
          onClick={onRefresh}
          title="刷新文件树"
          aria-label="刷新文件树"
        >
          <RefreshCw aria-hidden className="size-3" />
        </button>
      </div>

      <div className="p-2.5">
        <label className="relative block">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input
            id="tree-search"
            className="abs-input h-8 pl-8 text-[11.5px]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文件 / 路径"
            aria-label="搜索文件"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {isLoading ? (
          <div className="p-2">
            <SkeletonList rows={6} />
          </div>
        ) : error ? (
          <ErrorNote error={error} onRetry={onRetry} className="m-1" />
        ) : !model || model.files.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-muted">
            没有找到 Markdown 文件。
            <br />
            检查根目录和排除规则。
          </p>
        ) : filtered ? (
          filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-muted">没有匹配「{query}」的文件。</p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    className="abs-tree-row"
                    data-selected={activePath === file.path ? 'true' : 'false'}
                    onClick={() => openFile(file.path)}
                    title={file.path}
                  >
                    <FileText aria-hidden className="size-3.5 shrink-0 text-muted" />
                    <span className="truncate">{file.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-muted">
                      {file.path.split('/').slice(-2, -1)[0]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <ul className="space-y-0.5">{model.nodes.map((node) => renderNode(node, 0))}</ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line-soft px-3 py-2 font-mono text-[9.5px] text-muted">
        <span>已排除 {model?.excludedCount ?? 0}</span>
        <Link to="/settings" className="text-ink-soft underline decoration-line underline-offset-2 hover:text-sakura">
          规则
        </Link>
      </div>
    </div>
  );
}
