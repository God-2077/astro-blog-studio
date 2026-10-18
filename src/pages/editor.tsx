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
import { FrontmatterForm } from '@/components/frontmatter-form';
import { Badge, ErrorNote, Field, Spinner } from '@/components/ui';
import { useFile } from '@/hooks/use-data';
import {
  buildFrontmatterPatch,
  type FrontmatterFormValue,
  type FrontmatterFormValues,
  formValuesFromData,
} from '@/lib/frontmatter/fields';
import { useGateway } from '@/lib/gateway/context';
import { mapError } from '@/lib/github/errors';
import { composeDocument, type DocumentMeta, parseDocument, updateFrontmatterRaw } from '@/lib/markdown/document';
import { renderMarkdown } from '@/lib/markdown/render';
import { renderCommitMessage } from '@/lib/paths/commit-message';
import { joinPath, normalizeRepoPath } from '@/lib/paths/paths';
import { formatInTimeZone } from '@/lib/utils/date';
import { useEditorGuard } from '@/stores/editor';
import { useLastCommit } from '@/stores/last-commit';
import { usePendingPost } from '@/stores/pending-post';
import { useSettings } from '@/stores/settings';

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
  const isNew = params.get('new') === '1';
  const navigate = useNavigate();
  const { gateway, repo, config, key, mode } = useGateway();
  const settings = useSettings();
  const fields = settings.frontmatter.fields;
  const queryClient = useQueryClient();
  const setLastCommit = useLastCommit((state) => state.setCommit);
  const pendingDraft = usePendingPost((state) => state.draft);
  const file = useFile(isNew ? null : path);

  const [body, setBody] = useState('');
  const [rawInner, setRawInner] = useState('');
  const [hasFrontmatter, setHasFrontmatter] = useState(true);
  const [meta, setMeta] = useState<DocumentMeta>({ eol: '\n', mixed: false, bom: false, trailingNewline: true });
  const [form, setForm] = useState<FrontmatterFormValues>({});
  const [originalData, setOriginalData] = useState<Record<string, unknown>>({});
  const [loadedSha, setLoadedSha] = useState('');
  const [fmError, setFmError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [draftLost, setDraftLost] = useState(false);
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
    if (!path) return;
    const source = isNew ? pendingDraft : file.data ? { path: file.data.path, text: file.data.text } : null;
    if (isNew && (!source || source.path !== path)) {
      setDraftLost(true);
      return;
    }
    if (!source) return;

    const parsed = parseDocument(source.text);
    setDraftLost(false);
    setRawInner(parsed.frontmatterRaw);
    setHasFrontmatter(parsed.hasFrontmatter);
    setMeta(parsed.meta);
    setBody(parsed.body.replace(/\r\n?/g, '\n'));
    setForm(formValuesFromData(fields, parsed.data));
    setOriginalData(parsed.data);
    setFmError(parsed.frontmatterError ?? null);
    setFieldErrors({});
    setLoadedSha(isNew ? '' : (file.data?.sha ?? ''));
    setDirty(isNew);
    setConflictOpen(false);
    setSaveOpen(false);
  }, [isNew, pendingDraft, file.data, path, fields]);

  useEffect(() => {
    if (!path) return;
    const template = isNew ? settings.commit.create : settings.commit.update;
    const action = isNew ? 'create' : 'update';
    setMessage(
      renderCommitMessage(template, {
        path,
        action,
        date: formatInTimeZone(new Date(), config.timezone),
      }),
    );
  }, [path, isNew, settings.commit.create, settings.commit.update, config.timezone]);

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

  const extraFields = useMemo(() => {
    const configured = new Set(fields.map((field) => field.name));
    return Object.keys(originalData).filter((field) => !configured.has(field));
  }, [originalData, fields]);

  const isTrue = (name: string): boolean => form[name] === true;

  const markDirty = (): void => {
    setDirty(true);
    setSaveOpen(false);
  };

  const updateField = (name: string, value: FrontmatterFormValue): void => {
    setForm((previous) => ({ ...previous, [name]: value }));
    setFieldErrors((previous) => {
      if (!previous[name]) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
    markDirty();
  };

  const buildText = (): { text: string; errors: Record<string, string> } => {
    if (fmError) {
      return {
        text: composeDocument({ meta, frontmatterRaw: rawInner, body, includeFrontmatter: hasFrontmatter }),
        errors: {},
      };
    }
    const autoUpdatedAt = settings.editor.updateUpdatedAt && dirty ? formatInTimeZone(new Date(), config.timezone) : undefined;
    const { patch, errors } = buildFrontmatterPatch(fields, form, originalData, { autoUpdatedAt });
    if (Object.keys(errors).length) return { text: '', errors };
    const raw = updateFrontmatterRaw(rawInner, patch);
    return {
      text: composeDocument({
        meta,
        frontmatterRaw: raw,
        body,
        includeFrontmatter: hasFrontmatter || Object.keys(patch).length > 0,
      }),
      errors: {},
    };
  };

  const applySaved = async (result: { sha: string; contentSha?: string; htmlUrl?: string }, text: string): Promise<void> => {
    const wasNew = isNew;
    setDirty(false);
    setSaveOpen(false);
    setConflictOpen(false);
    setFieldErrors({});
    if (result.contentSha) setLoadedSha(result.contentSha);
    if (path) {
      queryClient.setQueryData(['file', key, path], {
        path,
        text,
        sha: result.contentSha ?? loadedSha,
        size: new Blob([text]).size,
      });
    }
    await queryClient.invalidateQueries({ queryKey: ['tree', key] });
    setLastCommit({
      sha: result.sha,
      message,
      path: path ?? '',
      at: Date.now(),
      ...(result.htmlUrl ? { htmlUrl: result.htmlUrl } : {}),
    });
    if (wasNew) {
      navigate(`/edit?path=${encodeURIComponent(path ?? '')}`, { replace: true });
      usePendingPost.getState().clearDraft();
      toast.success('已创建并提交 · 1 个提交');
    } else {
      toast.success('已提交 · 1 个提交');
    }
  };

  const performSave = async (overrideSha?: string): Promise<void> => {
    if (!path) return;
    const { text, errors } = buildText();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      toast.error('请先修正 frontmatter 字段', { description: '有必填字段为空或格式不正确。' });
      return;
    }
    setSaving(true);
    setStamping(true);
    window.setTimeout(() => setStamping(false), 900);
    try {
      const result = await gateway.writeFile({
        path,
        text,
        message,
        branch: repo.defaultBranch,
        ...(isNew ? {} : { sha: overrideSha ?? loadedSha }),
      });
      await applySaved(result, text);
    } catch (caught) {
      const error = mapError(caught);
      if (error.code === 'CONFLICT') {
        if (isNew) {
          toast.error('远端已经有同名文件', { description: '请回到工作台换一个文件名或路径；当前草稿仍保留。' });
        } else {
          setConflictOpen(true);
        }
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
    if (!path || isNew) return;
    const { text, errors } = buildText();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      toast.error('请先修正 frontmatter 字段');
      return;
    }
    try {
      const latest = await gateway.readFile(path);
      const result = await gateway.writeFile({
        path,
        text,
        message,
        branch: repo.defaultBranch,
        sha: latest.sha,
      });
      await applySaved(result, text);
      toast.success('已覆盖远端并提交');
    } catch (caught) {
      toast.error(mapError(caught).message);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!path || isNew) return;
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
    if (!path || isNew) return;
    const target = joinPath(normalizeRepoPath(moveTarget));
    if (!target || target === path) {
      setMoveError('请输入不同的目标路径');
      return;
    }
    setMoveError(null);
    try {
      const { text, errors } = buildText();
      if (Object.keys(errors).length) {
        setMoveError('请先修正 frontmatter 字段');
        return;
      }
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

  if (isNew && draftLost) {
    return (
      <div className="abs-paper mx-auto max-w-[620px] p-6">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">draft lost</p>
        <h1 className="mt-1 font-display text-[24px] font-bold">新文章草稿已丢失</h1>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          新文章草稿只保存在创建它的标签页里。刷新或直接打开这个链接后，草稿不会再恢复，也不会在仓库里留下空文件。
        </p>
        <button type="button" className="abs-btn abs-btn-primary mt-4 text-[11px]" onClick={() => navigate('/')}>
          <ArrowLeft aria-hidden className="size-3.5" />
          回到工作台重新新建
        </button>
      </div>
    );
  }

  if (!isNew && file.isLoading) {
    return (
      <div className="abs-paper p-6">
        <Spinner label="读取文件" />
      </div>
    );
  }

  if (!isNew && file.error) {
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
  const githubUrl = isNew
    ? undefined
    : `${repo.htmlUrl}/blob/${repo.defaultBranch}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const isDemo = mode === 'demo';
  const hasUpdatedField = fields.some((field) => field.name === 'updated' && field.type === 'date');
  const updatedFieldHint = fieldErrors.updated
    ? '格式错误'
    : settings.editor.updateUpdatedAt
      ? '未填写会自动更新'
      : '按输入保存';

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
                  {isNew ? (
                    <Badge tone="blush">未提交</Badge>
                  ) : dirty ? (
                    <Badge tone="blush">未保存</Badge>
                  ) : (
                    <Badge tone="mint">已保存</Badge>
                  )}
                  {isTrue('draft') ? <Badge tone="butter">草稿</Badge> : null}
                  {isTrue('sticky') ? <Badge tone="mint">置顶</Badge> : null}
                  {fmError ? <Badge tone="blush">YAML 异常</Badge> : null}
                </div>
                <p className="mt-0.5 truncate font-mono text-[9px] text-muted">{path}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {githubUrl ? (
                <a
                  className="abs-btn abs-btn-ghost h-8 text-[10.5px]"
                  href={githubUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  GitHub
                  <ArrowUpRight aria-hidden className="size-3" />
                </a>
              ) : null}
              {!isNew ? (
                <>
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
                </>
              ) : null}
            </div>
          </div>
        </header>

        <section className="abs-paper relative p-3.5">
          <span className="abs-tape" aria-hidden />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">frontmatter</span>
            <span className="font-mono text-[9px] text-muted">
              {isNew ? '新文件 · 保存时创建' : hasFrontmatter ? `${Object.keys(originalData).length} fields` : '无'}
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
            <>
              <FrontmatterForm fields={fields} values={form} errors={fieldErrors} onChange={updateField} />
              <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[9px] text-muted">
                <span>{meta.eol === '\r\n' ? 'CRLF' : 'LF'} 保留</span>
                {hasUpdatedField ? <span>{updatedFieldHint}</span> : null}
                {isNew ? <span className="text-sakura">首次保存只调用一次创建 API</span> : null}
              </div>
            </>
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
              {isNew ? (
                <span className="text-[10px] font-bold text-sakura">未提交</span>
              ) : dirty ? (
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
                    aria-label={isNew ? '创建并提交' : '保存并提交'}
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
                      {repo.defaultBranch} · {isNew ? '将创建 1 个提交' : '1 个提交'} · {dirty ? '含未保存修改' : '无改动'}
                    </p>
                    <button
                      type="button"
                      className="abs-btn abs-btn-primary mt-2.5 w-full text-[11px]"
                      onClick={() => void performSave()}
                      disabled={saving}
                    >
                      <Check aria-hidden className="size-3.5" />
                      {saving ? '提交中…' : isNew ? '确认创建' : '确认盖章'}
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
