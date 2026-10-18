import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import * as AlarmDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { ArrowLeft, ArrowUpRight, Check, FileWarning, MoveRight, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge, ErrorNote, Field, Spinner } from '@/components/ui';
import { useFile } from '@/hooks/use-data';
import { useGateway } from '@/lib/gateway/context';
import { mapError } from '@/lib/github/errors';
import { composeDocument, type DocumentMeta, parseDocument, updateFrontmatterRaw } from '@/lib/markdown/document';
import { renderMarkdown } from '@/lib/markdown/render';
import { renderCommitMessage } from '@/lib/paths/commit-message';
import { joinPath, normalizeRepoPath } from '@/lib/paths/paths';
import { formatInTimeZone } from '@/lib/utils/date';
import { useEditorGuard } from '@/stores/editor';
import { useLastCommit } from '@/stores/last-commit';
import { useSettings } from '@/stores/settings';

interface FrontForm {
  title: string;
  date: string;
  updated: string;
  categories: string;
  tags: string;
  draft: boolean;
  sticky: boolean;
}

const KNOWN_FIELDS = new Set(['title', 'date', 'updated', 'categories', 'tags', 'draft', 'sticky']);

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function categoriesToString(value: unknown): string {
  if (!Array.isArray(value)) return '';
  if (value.length === 1 && Array.isArray(value[0])) {
    return (value[0] as unknown[]).filter((part): part is string => typeof part === 'string').join(' > ');
  }
  return value.filter((part): part is string => typeof part === 'string').join(', ');
}

function tagsToString(value: unknown): string {
  return Array.isArray(value) ? value.filter((part): part is string => typeof part === 'string').join(', ') : '';
}

function formFromData(data: Record<string, unknown>): FrontForm {
  return {
    title: asString(data.title),
    date: asString(data.date),
    updated: asString(data.updated),
    categories: categoriesToString(data.categories),
    tags: tagsToString(data.tags),
    draft: data.draft === true,
    sticky: data.sticky === true,
  };
}

function parseCategories(value: string): string[] | string[][] | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes('>')) {
    const path = trimmed
      .split('>')
      .map((part) => part.trim())
      .filter(Boolean);
    return path.length ? [path] : undefined;
  }
  const list = trimmed
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

function parseTags(value: string): string[] | undefined {
  const list = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

function editorTheme(fontSize: number): ReturnType<typeof EditorView.theme> {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        color: 'var(--abs-ink)',
        fontSize: `${fontSize}px`,
      },
      '.cm-scroller': { fontFamily: 'var(--abs-font-mono)', lineHeight: '1.9' },
      '.cm-content': { padding: '10px 0' },
      '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--abs-muted)' },
      '.cm-activeLine': { backgroundColor: 'rgba(247, 221, 229, 0.42)' },
      '.cm-cursor': { borderLeftColor: 'var(--abs-sakura)' },
      '&.cm-focused': { outline: 'none' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: 'rgba(201, 63, 109, 0.16) !important',
      },
    },
    { dark: false },
  );
}

export function EditorPage() {
  const [params] = useSearchParams();
  const path = params.get('path');
  const navigate = useNavigate();
  const { gateway, repo, config, key, mode } = useGateway();
  const settings = useSettings();
  const queryClient = useQueryClient();
  const setLastCommit = useLastCommit((state) => state.setCommit);
  const file = useFile(path);

  const [body, setBody] = useState('');
  const [rawInner, setRawInner] = useState('');
  const [hasFrontmatter, setHasFrontmatter] = useState(true);
  const [meta, setMeta] = useState<DocumentMeta>({ eol: '\n', mixed: false, bom: false, trailingNewline: true });
  const [form, setForm] = useState<FrontForm>({
    title: '',
    date: '',
    updated: '',
    categories: '',
    tags: '',
    draft: false,
    sticky: false,
  });
  const [originalData, setOriginalData] = useState<Record<string, unknown>>({});
  const [loadedSha, setLoadedSha] = useState('');
  const [fmError, setFmError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stamping, setStamping] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [conflictOpen, setConflictOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!file.data || !path) return;
    const parsed = parseDocument(file.data.text);
    setRawInner(parsed.frontmatterRaw);
    setHasFrontmatter(parsed.hasFrontmatter);
    setMeta(parsed.meta);
    setBody(parsed.body.replace(/\r\n?/g, '\n'));
    setForm(formFromData(parsed.data));
    setOriginalData(parsed.data);
    setFmError(parsed.frontmatterError ?? null);
    setLoadedSha(file.data.sha);
    setDirty(false);
    setConflictOpen(false);
    setSaveOpen(false);
  }, [file.data, path]);

  useEffect(() => {
    if (!path) return;
    setMessage(
      renderCommitMessage(settings.commit.update, {
        path,
        action: 'update',
        date: formatInTimeZone(new Date(), config.timezone),
      }),
    );
  }, [path, settings.commit.update, config.timezone]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  useEffect(() => {
    useEditorGuard.getState().setDirty(dirty);
    return () => useEditorGuard.getState().setDirty(false);
  }, [dirty]);

  const extraFields = useMemo(() => Object.keys(originalData).filter((field) => !KNOWN_FIELDS.has(field)), [originalData]);

  const buildText = (): string => {
    if (fmError) {
      return composeDocument({ meta, frontmatterRaw: rawInner, body, includeFrontmatter: hasFrontmatter });
    }
    const original = originalData;
    const patch: Record<string, unknown> = {};
    if (form.title !== asString(original.title)) patch.title = form.title;
    if (form.date !== asString(original.date)) patch.date = form.date;
    if (form.updated !== asString(original.updated)) patch.updated = form.updated;
    if (
      form.categories !==
      (Array.isArray(original.categories)
        ? original.categories.length === 1 && Array.isArray(original.categories[0])
          ? (original.categories[0] as string[]).join(' > ')
          : (original.categories as string[]).join(', ')
        : '')
    ) {
      const categories = parseCategories(form.categories);
      if (categories) patch.categories = categories;
    }
    if (form.tags !== tagsToString(original.tags)) {
      const tags = parseTags(form.tags);
      if (tags) patch.tags = tags;
    }
    if (form.draft !== (original.draft === true)) patch.draft = form.draft;
    if (form.sticky !== (original.sticky === true)) patch.sticky = form.sticky;
    if (settings.editor.updateUpdatedAt && dirty && form.updated === asString(original.updated)) {
      patch.updated = formatInTimeZone(new Date(), config.timezone);
    }
    const raw = updateFrontmatterRaw(rawInner, patch);
    return composeDocument({
      meta,
      frontmatterRaw: raw,
      body,
      includeFrontmatter: hasFrontmatter || Object.keys(patch).length > 0,
    });
  };

  const markDirty = (): void => {
    setDirty(true);
    setSaveOpen(false);
  };

  const updateForm = <Key extends keyof FrontForm>(field: Key, value: FrontForm[Key]): void => {
    setForm((previous) => ({ ...previous, [field]: value }));
    markDirty();
  };

  const applySaved = async (
    resultSha: string,
    contentSha: string | undefined,
    text: string,
    htmlUrl?: string,
  ): Promise<void> => {
    setDirty(false);
    setSaveOpen(false);
    setConflictOpen(false);
    if (contentSha) {
      setLoadedSha(contentSha);
      queryClient.setQueryData(['file', key, path], {
        path: path as string,
        text,
        sha: contentSha,
        size: new Blob([text]).size,
      });
    }
    await queryClient.invalidateQueries({ queryKey: ['tree', key] });
    setLastCommit({
      sha: resultSha,
      message,
      path: path ?? '',
      at: Date.now(),
      ...(htmlUrl ? { htmlUrl } : {}),
    });
    toast.success('已提交 · 1 个提交');
  };

  const performSave = async (overrideSha?: string): Promise<void> => {
    if (!path) return;
    if (!fmError && !form.title.trim()) {
      toast.error('title 不能为空');
      return;
    }
    setSaving(true);
    setStamping(true);
    window.setTimeout(() => setStamping(false), 900);
    try {
      const text = buildText();
      const result = await gateway.writeFile({
        path,
        text,
        message,
        branch: repo.defaultBranch,
        sha: overrideSha ?? loadedSha,
      });
      await applySaved(result.sha, result.contentSha, text, result.htmlUrl);
    } catch (caught) {
      const error = mapError(caught);
      if (error.code === 'CONFLICT') {
        setConflictOpen(true);
      } else {
        toast.error(error.message, { description: error.detail });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (): void => {
    if (settings.commit.confirmBeforeCommit) setSaveOpen(true);
    else void performSave();
  };

  const handleOverwrite = async (): Promise<void> => {
    if (!path) return;
    if (!fmError && !form.title.trim()) {
      toast.error('title 不能为空');
      return;
    }
    try {
      const latest = await gateway.readFile(path);
      const text = buildText();
      const result = await gateway.writeFile({
        path,
        text,
        message,
        branch: repo.defaultBranch,
        sha: latest.sha,
      });
      await applySaved(result.sha, result.contentSha ?? latest.sha, text, result.htmlUrl);
      toast.success('已覆盖远端并提交');
    } catch (caught) {
      toast.error(mapError(caught).message);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!path) return;
    try {
      await gateway.deleteFile({
        path,
        message: renderCommitMessage(settings.commit.delete, {
          path,
          action: 'delete',
          date: formatInTimeZone(new Date(), config.timezone),
        }),
        branch: repo.defaultBranch,
        sha: loadedSha,
      });
      await queryClient.invalidateQueries({ queryKey: ['tree', key] });
      toast.success('已删除并提交');
      navigate('/');
    } catch (caught) {
      toast.error(mapError(caught).message);
    }
  };

  const handleMove = async (): Promise<void> => {
    if (!path) return;
    const target = joinPath(normalizeRepoPath(moveTarget));
    if (!target || target === path) {
      setMoveError('请输入不同的目标路径');
      return;
    }
    setMoveError(null);
    try {
      const text = buildText();
      const result = await gateway.moveFile({
        from: path,
        to: target,
        text,
        message: renderCommitMessage(settings.commit.move, {
          path: target,
          oldPath: path,
          newPath: target,
          action: 'move',
          date: formatInTimeZone(new Date(), config.timezone),
        }),
        branch: repo.defaultBranch,
        sha: loadedSha,
      });
      setLastCommit({
        sha: result.sha,
        message: result.message,
        path: target,
        at: Date.now(),
        ...(result.htmlUrl ? { htmlUrl: result.htmlUrl } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['tree', key] });
      toast.success('已移动并提交');
      setMoveOpen(false);
      navigate(`/edit?path=${encodeURIComponent(target)}`);
    } catch (caught) {
      setMoveError(mapError(caught).detail ?? mapError(caught).message);
    }
  };

  if (!path) return <Navigate to="/" replace />;

  if (file.isLoading) {
    return (
      <div className="abs-paper p-6">
        <Spinner label="读取文件" />
      </div>
    );
  }

  if (file.error) {
    return (
      <div className="space-y-3">
        <ErrorNote error={file.error} onRetry={() => void file.refetch()} />
        <button type="button" className="abs-btn" onClick={() => navigate('/')}>
          <ArrowLeft aria-hidden className="size-3.5" />
          回到工作台
        </button>
      </div>
    );
  }

  const rendered = renderMarkdown(body);
  const words = body.replace(/\s+/g, '').length;
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  const githubUrl = `${repo.htmlUrl}/blob/${repo.defaultBranch}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const isDemo = mode === 'demo';

  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-3">
        <header className="abs-paper min-w-0 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <button
                type="button"
                className="abs-icon-btn mt-0.5"
                onClick={() => {
                  if (dirty && !window.confirm('有未保存的修改，确定离开吗？')) return;
                  navigate('/');
                }}
                aria-label="回到工作台"
              >
                <ArrowLeft aria-hidden className="size-3.5" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="truncate font-display text-[18px] font-bold leading-tight">{fileName}</h1>
                  {dirty ? <Badge tone="blush">未保存</Badge> : <Badge tone="mint">已保存</Badge>}
                  {form.draft ? <Badge tone="butter">草稿</Badge> : null}
                  {form.sticky ? <Badge tone="mint">置顶</Badge> : null}
                  {fmError ? <Badge tone="blush">YAML 异常</Badge> : null}
                </div>
                <p className="mt-0.5 truncate font-mono text-[9px] text-muted">{path}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <a className="abs-btn abs-btn-ghost h-8 text-[10.5px]" href={githubUrl} target="_blank" rel="noreferrer noopener">
                GitHub
                <ArrowUpRight aria-hidden className="size-3" />
              </a>
              <button
                type="button"
                className="abs-btn abs-btn-ghost h-8 text-[10.5px]"
                onClick={() => {
                  setMoveTarget(path);
                  setMoveError(null);
                  setMoveOpen(true);
                }}
              >
                <MoveRight aria-hidden className="size-3" />
                移动
              </button>
              <button
                type="button"
                className="abs-btn abs-btn-ghost h-8 border-danger/40 text-[10.5px] text-danger"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 aria-hidden className="size-3" />
                删除
              </button>
            </div>
          </div>
        </header>

        <section className="abs-paper relative p-3.5">
          <span className="abs-tape" aria-hidden />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">frontmatter</span>
            <span className="font-mono text-[9px] text-muted">
              {hasFrontmatter ? `${Object.keys(originalData).length} fields` : '无（保存时创建）'}
              {extraFields.length ? ` · ${extraFields.length} 个未知字段保留` : ''}
            </span>
          </div>

          {fmError ? (
            <div className="mt-2 space-y-2">
              <p className="flex items-start gap-1.5 text-[11px] text-danger">
                <FileWarning aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                YAML 解析失败：{fmError}
              </p>
              <textarea
                className="abs-textarea min-h-[150px] font-mono text-[11px]"
                value={rawInner}
                onChange={(event) => {
                  setRawInner(event.target.value);
                  markDirty();
                }}
                aria-label="原始 frontmatter"
              />
              <p className="text-[10px] text-muted">修好 YAML 后保存；正文改动会原样保留。</p>
            </div>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Field label="title" className="sm:col-span-2">
                <input className="abs-input" value={form.title} onChange={(event) => updateForm('title', event.target.value)} />
              </Field>
              <Field label="date">
                <input
                  className="abs-input"
                  value={form.date}
                  onChange={(event) => updateForm('date', event.target.value)}
                  placeholder="2024-07-21 20:10:28"
                />
              </Field>
              <Field label="updated">
                <input
                  className="abs-input"
                  value={form.updated}
                  onChange={(event) => updateForm('updated', event.target.value)}
                  placeholder="留空则按设置自动更新"
                />
              </Field>
              <Field label="categories" hint="用 > 表示层级，或用逗号分隔多个">
                <input
                  className="abs-input"
                  value={form.categories}
                  onChange={(event) => updateForm('categories', event.target.value)}
                />
              </Field>
              <Field label="tags" hint="逗号分隔">
                <input className="abs-input" value={form.tags} onChange={(event) => updateForm('tags', event.target.value)} />
              </Field>
              <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
                <label className="flex items-center gap-1.5 text-[11px]">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[var(--abs-sakura)]"
                    checked={form.draft}
                    onChange={(event) => updateForm('draft', event.target.checked)}
                  />
                  草稿
                </label>
                <label className="flex items-center gap-1.5 text-[11px]">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[var(--abs-sakura)]"
                    checked={form.sticky}
                    onChange={(event) => updateForm('sticky', event.target.checked)}
                  />
                  置顶
                </label>
                <span className="font-mono text-[9px] text-muted">{meta.eol === '\r\n' ? 'CRLF' : 'LF'} 保留</span>
              </div>
            </div>
          )}
        </section>

        <section className="abs-sheet min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">markdown</span>
            <span className="font-mono text-[9px] text-muted">
              {words.toLocaleString('en-US')} 字 · 约 {Math.max(1, Math.round(words / 300))} 分钟
            </span>
          </div>
          <div className="min-w-0 px-2">
            <CodeMirror
              value={body}
              height="520px"
              theme={editorTheme(settings.editor.fontSize)}
              extensions={[markdown(), EditorView.lineWrapping]}
              basicSetup={{
                lineNumbers: settings.editor.showLineNumbers,
                foldGutter: false,
                highlightActiveLine: true,
                autocompletion: true,
                bracketMatching: true,
                closeBrackets: true,
              }}
              onChange={(value) => {
                setBody(value);
                markDirty();
              }}
            />
          </div>
          <footer className="flex flex-wrap items-end justify-between gap-3 border-t border-line-soft px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-mono text-[9px] text-muted">{path}</p>
              <p className="mt-0.5 flex items-center gap-2 font-mono text-[9px] text-muted">
                {meta.mixed ? (
                  <span className="text-warning">混用换行符，保存将统一为 {meta.eol === '\r\n' ? 'CRLF' : 'LF'}</span>
                ) : null}
                {!isDemo && !repo.canPush ? <span className="text-danger">只读令牌</span> : null}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {dirty ? (
                <span className="text-[10px] font-bold text-sakura">未保存</span>
              ) : (
                <span className="text-[10px] text-muted">已保存</span>
              )}
              <Popover.Root open={saveOpen} onOpenChange={setSaveOpen}>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="abs-stamp"
                    data-stamping={stamping ? 'true' : 'false'}
                    onClick={(event) => {
                      if (!settings.commit.confirmBeforeCommit) {
                        event.preventDefault();
                        handleSave();
                      }
                    }}
                    disabled={saving || !repo.canPush}
                    aria-label="保存并提交"
                  >
                    盖 章
                    <br />保 存
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    side="top"
                    align="end"
                    sideOffset={10}
                    className="z-50 w-[340px] max-w-[calc(100vw-24px)] rounded-xl border-[1.5px] border-ink bg-paper p-3 shadow-pop outline-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-[13px] font-bold">本次提交</span>
                      <Popover.Close className="abs-icon-btn size-6" aria-label="关闭">
                        <X aria-hidden className="size-3" />
                      </Popover.Close>
                    </div>
                    <textarea
                      className="abs-textarea mt-2 min-h-[64px] font-mono text-[10px]"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      aria-label="提交消息"
                    />
                    <p className="mt-1.5 font-mono text-[9px] text-muted">
                      {repo.defaultBranch} · 1 个提交 · {dirty ? '含未保存修改' : '无改动'}
                    </p>
                    <button
                      type="button"
                      className="abs-btn abs-btn-primary mt-2.5 w-full text-[11px]"
                      onClick={() => void performSave()}
                      disabled={saving}
                    >
                      <Check aria-hidden className="size-3.5" />
                      {saving ? '提交中…' : '确认盖章'}
                    </button>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          </footer>
        </section>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-[76px] xl:self-start">
        <div className="abs-paper flex max-h-[calc(100vh-96px)] min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">预览 · 实时</span>
            <span className="flex items-center gap-1 font-mono text-[9px] text-success">
              <span className="size-1.5 rounded-full bg-success" />
              {rendered.warnings.length ? `${rendered.warnings.length} 个净化提示` : 'OK'}
            </span>
          </div>
          {rendered.warnings.length ? (
            <p className="border-b border-line-soft bg-butter/50 px-3 py-1.5 text-[9.5px] leading-relaxed text-warning">
              {rendered.warnings.join(' · ')}
            </p>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="abs-preview" dangerouslySetInnerHTML={{ __html: rendered.html }} />
          </div>
        </div>
      </aside>

      <Dialog.Root open={conflictOpen} onOpenChange={setConflictOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[1.5px] border-ink bg-paper p-5 shadow-pop">
            <Dialog.Title className="font-display text-[20px] font-bold">远端文件已经变化</Dialog.Title>
            <Dialog.Description className="mt-1 text-[11px] leading-relaxed text-muted">
              保存被拒绝了，避免静默覆盖别人的修改。选择一种处理方式。
            </Dialog.Description>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="abs-btn text-[11px]"
                onClick={() => {
                  setConflictOpen(false);
                  void file.refetch();
                }}
              >
                重新加载远端
              </button>
              <button type="button" className="abs-btn abs-btn-primary text-[11px]" onClick={() => void handleOverwrite()}>
                覆盖远端
              </button>
              <button type="button" className="abs-btn abs-btn-ghost text-[11px]" onClick={() => setConflictOpen(false)}>
                取消
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={moveOpen} onOpenChange={setMoveOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[1.5px] border-ink bg-paper p-5 shadow-pop">
            <Dialog.Title className="font-display text-[20px] font-bold">移动 / 重命名</Dialog.Title>
            <Dialog.Description className="mt-1 text-[11px] text-muted">
              一次提交完成移动；目标路径不能已存在。
            </Dialog.Description>
            <Field label="目标路径" className="mt-4">
              <input
                className="abs-input font-mono text-[11px]"
                value={moveTarget}
                onChange={(event) => setMoveTarget(event.target.value)}
              />
            </Field>
            {moveError ? <p className="mt-2 text-[11px] text-danger">{moveError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="abs-btn abs-btn-ghost text-[11px]" onClick={() => setMoveOpen(false)}>
                取消
              </button>
              <button type="button" className="abs-btn abs-btn-primary text-[11px]" onClick={() => void handleMove()}>
                移动并提交
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AlarmDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlarmDialog.Portal>
          <AlarmDialog.Overlay className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]" />
          <AlarmDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[1.5px] border-ink bg-paper p-5 shadow-pop">
            <AlarmDialog.Title className="font-display text-[20px] font-bold text-danger">删除这篇文章？</AlarmDialog.Title>
            <AlarmDialog.Description className="mt-1 break-all font-mono text-[10px] leading-relaxed text-muted">
              {path}
            </AlarmDialog.Description>
            <p className="mt-3 text-[11px] text-ink-soft">
              会创建一个删除提交到 {repo.defaultBranch}。这个操作不会从 Git 历史里消失。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <AlarmDialog.Cancel className="abs-btn abs-btn-ghost text-[11px]">取消</AlarmDialog.Cancel>
              <AlarmDialog.Action
                className="abs-btn border-danger bg-danger text-[11px] text-white"
                onClick={() => void handleDelete()}
              >
                删除并提交
              </AlarmDialog.Action>
            </div>
          </AlarmDialog.Content>
        </AlarmDialog.Portal>
      </AlarmDialog.Root>
    </div>
  );
}
