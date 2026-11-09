import * as Dialog from '@radix-ui/react-dialog';
import { FilePlus2, FileWarning, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field } from '@/components/ui';
import { useParkPendingDraft } from '@/hooks/use-pending-draft';
import { buildNewPostDocument, hasRequiredTitleField } from '@/lib/frontmatter/fields';
import { useGateway } from '@/lib/gateway/context';
import { type TFunction, useT } from '@/lib/i18n/react';
import { renderCommitMessage, resolveCommitTitle } from '@/lib/paths/commit-message';
import { type FilenameIssue, resolveManualFilename, resolveTitleFilename } from '@/lib/paths/filename';
import { isMarkdownDocument, joinPath, normalizeRepoPath } from '@/lib/paths/paths';
import { collectFolders, type TreeModel } from '@/lib/tree/model';
import { formatInTimeZone } from '@/lib/utils/date';
import { usePendingPost } from '@/stores/pending-post';
import { useSettings } from '@/stores/settings';

function filenameIssueMessage(issue: FilenameIssue, t: TFunction): string {
  switch (issue.code) {
    case 'empty':
      return t('shell.newPost.errors.filenameRequired');
    case 'pathSeparator':
      return t('shell.newPost.errors.filenameSeparator');
    case 'control':
      return t('shell.newPost.errors.filenameControl');
    case 'illegalChars':
      return t('shell.newPost.errors.filenameIllegalChars', { chars: issue.chars });
    case 'reserved':
      return t('shell.newPost.errors.filenameReserved', { name: issue.name });
    case 'trailingDot':
      return t('shell.newPost.errors.filenameTrailingDot');
  }
  return t('shell.newPost.errors.filenameRequired');
}

export function NewPostDialog({
  open,
  onOpenChange,
  model,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: TreeModel | null;
}) {
  const t = useT();
  const { config } = useGateway();
  const settings = useSettings();
  const navigate = useNavigate();
  const setPendingDraft = usePendingPost((state) => state.setDraft);
  const parkPendingDraft = useParkPendingDraft();
  const [title, setTitle] = useState('');
  const [dir, setDir] = useState(settings.editor.defaultDir || config.rootDir);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [parking, setParking] = useState(false);
  const filenameRef = useRef<HTMLInputElement>(null);

  const folders = useMemo(
    () => (model ? collectFolders(model.nodes).map((folder) => joinPath(config.rootDir, folder.path)) : []),
    [model, config.rootDir],
  );

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setFilename('');
    setError(null);
    const preferred = settings.editor.defaultDir || config.rootDir;
    setDir(folders.includes(preferred) ? preferred : config.rootDir);
  }, [open, settings.editor.defaultDir, config.rootDir, folders]);

  const showTitle = hasRequiredTitleField(settings.frontmatter.fields);
  const usesTitle = showTitle && filename.trim().length === 0;
  const resolution = usesTitle ? resolveTitleFilename(title) : resolveManualFilename(filename);
  const finalFile = resolution.filename;
  const unsupportedSuffix = resolution.unsupportedSuffix;
  /** Explicit non-Markdown suffix: create an empty plain-text file, not a frontmatter draft. */
  const plainText = Boolean(finalFile) && !isMarkdownDocument(finalFile);
  useEffect(() => {
    if (open && (!showTitle || plainText)) filenameRef.current?.focus();
  }, [open, showTitle, plainText]);
  // 手动输入的文件名一旦不合法就立即提示；空值留到「开始起草」时再报必填，避免刚打开就标红。
  const liveIssue = !usesTitle && filename.trim().length > 0 ? resolution.issue : null;
  const liveError = liveIssue ? filenameIssueMessage(liveIssue, t) : null;
  const shownError = error ?? liveError;
  const normalizedDir = normalizeRepoPath(dir);
  const fullDir =
    config.rootDir && normalizedDir && !normalizedDir.startsWith(config.rootDir)
      ? joinPath(config.rootDir, normalizedDir)
      : normalizedDir || config.rootDir;
  const path = joinPath(fullDir, finalFile);
  const date = formatInTimeZone(new Date(), settings.content.timezone);
  const messageTitle =
    showTitle && !plainText ? title.trim() || undefined : finalFile ? resolveCommitTitle('', path) : undefined;
  const message = renderCommitMessage(settings.commit.create, {
    path,
    action: 'create',
    date,
    title: messageTitle,
  });
  const collision = Boolean(model?.files.some((file) => file.path === path));

  const handleCreate = async (): Promise<void> => {
    if (parking) return;
    if (showTitle && !title.trim() && !plainText) {
      setError(t('shell.newPost.errors.titleRequired'));
      return;
    }
    if (resolution.issue) {
      setError(filenameIssueMessage(resolution.issue, t));
      return;
    }
    if (collision) {
      setError(t('shell.newPost.errors.pathTaken'));
      return;
    }
    // Starting another post always parks the current in-memory draft first;
    // no confirmation dialog is needed because nothing is lost.
    const existing = usePendingPost.getState().draft;
    if (existing) {
      setParking(true);
      const result = await parkPendingDraft();
      setParking(false);
      if (result === 'failed') {
        setError(t('shell.newPost.errors.parkFailed'));
        return;
      }
    }

    const text = plainText
      ? ''
      : buildNewPostDocument(settings.frontmatter.fields, { title: showTitle ? title.trim() : '', date });
    setPendingDraft({ path, text });
    onOpenChange(false);
    navigate(`/edit?path=${encodeURIComponent(path)}&new=1`);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--abs-overlay)] backdrop-blur-[2px] data-[state=open]:animate-[abs-pop_160ms_ease-out]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-24px)] w-[min(600px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">{t('shell.newPost.eyebrow')}</p>
              <Dialog.Title className="font-display text-[22px] font-bold leading-tight">
                {t('shell.newPost.title')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[11px] leading-relaxed text-muted">
                {t('shell.newPost.description')}
              </Dialog.Description>
            </div>
            <Dialog.Close className="abs-icon-btn" aria-label={t('common.close')}>
              <X aria-hidden className="size-3.5" />
            </Dialog.Close>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {showTitle && !plainText ? (
              <Field label={t('shell.newPost.titleLabel')} className="sm:col-span-2">
                <input
                  className="abs-input"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setError(null);
                  }}
                  placeholder={t('shell.newPost.titlePlaceholder')}
                />
              </Field>
            ) : null}
            <Field label={t('shell.newPost.dirLabel')} hint={<span className="font-mono">{t('shell.newPost.dirHint')}</span>}>
              <input
                className="abs-input font-mono text-[11px]"
                value={dir}
                onChange={(event) => {
                  setDir(event.target.value);
                  setError(null);
                }}
                list="studio-folders"
              />
              <datalist id="studio-folders">
                {folders.map((folder) => (
                  <option key={folder} value={folder} />
                ))}
              </datalist>
            </Field>
            <Field
              label={t('shell.newPost.filenameLabel')}
              hint={
                <>
                  <span className="font-mono">
                    {showTitle ? t('shell.newPost.filenameHint') : t('shell.newPost.filenameHintRequired')}
                  </span>
                  {unsupportedSuffix ? (
                    <span className="mt-1 flex items-start gap-1.5 text-warning" role="status">
                      <FileWarning aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                      {t('shell.newPost.filenameExtensionHint', {
                        suffix: unsupportedSuffix,
                        name: finalFile,
                      })}
                    </span>
                  ) : null}
                </>
              }
            >
              <input
                className="abs-input font-mono text-[11px]"
                value={filename}
                onChange={(event) => {
                  setFilename(event.target.value);
                  setError(null);
                }}
                placeholder={finalFile || 'filename.md'}
                aria-required={showTitle ? undefined : true}
                ref={filenameRef}
              />
            </Field>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-line bg-paper-2 px-3 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">{t('shell.newPost.preview')}</p>
            <p className="mt-1 break-all font-mono text-[11px] text-ink">{path || '…'}</p>
            <p className="mt-2 text-[10px] text-muted">
              {t('shell.newPost.commitMessage')}
              <code className="font-mono text-[10px] text-sakura">{message}</code>
            </p>
          </div>

          {shownError ? (
            <p
              className="mt-3 rounded-lg border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2 text-[11px] text-danger"
              role="alert"
            >
              {shownError}
            </p>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Dialog.Close className="abs-btn abs-btn-ghost h-8 text-[11px]">{t('common.cancel')}</Dialog.Close>
            <button
              type="button"
              className="abs-btn abs-btn-primary h-8 text-[11px]"
              onClick={() => void handleCreate()}
              disabled={parking}
            >
              <FilePlus2 aria-hidden className="size-3.5" />
              {parking ? t('shell.newPost.parking') : t('shell.newPost.start')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
