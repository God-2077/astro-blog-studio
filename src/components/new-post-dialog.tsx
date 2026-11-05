import * as Dialog from '@radix-ui/react-dialog';
import { FilePlus2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirmAction, dismissConfirm } from '@/components/confirm-toast';
import { Field } from '@/components/ui';
import { useParkPendingDraft } from '@/hooks/use-pending-draft';
import { buildNewPostDocument, hasRequiredTitleField } from '@/lib/frontmatter/fields';
import { useGateway } from '@/lib/gateway/context';
import { useT } from '@/lib/i18n/react';
import { renderCommitMessage, resolveCommitTitle } from '@/lib/paths/commit-message';
import { joinPath, normalizeRepoPath } from '@/lib/paths/paths';
import { collectFolders, type TreeModel } from '@/lib/tree/model';
import { formatInTimeZone } from '@/lib/utils/date';
import { usePendingPost } from '@/stores/pending-post';
import { useSettings } from '@/stores/settings';

function sanitizeFilePart(value: string): string {
  const trimmed = value.trim();
  // 先摘出 .md 扩展名，避免被后面的标点替换吃掉
  const mdMatch = trimmed.match(/^(.*?)(\.md)$/i);
  const base = mdMatch?.[1] ?? trimmed;
  const ext = mdMatch?.[2] ?? '';

  const cleaned = base
    .replace(/[\p{P}\p{S}\s]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned ? `${cleaned}${ext}` : '';
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
  /** 确认条挂在 sonner 根层：等待回答期间先解除 Dialog 的模态，否则 body 的 pointer-events 会挡住它。 */
  const [confirming, setConfirming] = useState(false);
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
  useEffect(() => {
    if (open && !showTitle) filenameRef.current?.focus();
  }, [open, showTitle]);
  const safeName = sanitizeFilePart(showTitle ? filename || title : filename);
  const finalFile = safeName ? (safeName.toLowerCase().endsWith('.md') ? safeName : `${safeName}.md`) : '';
  const normalizedDir = normalizeRepoPath(dir);
  const fullDir =
    config.rootDir && normalizedDir && !normalizedDir.startsWith(config.rootDir)
      ? joinPath(config.rootDir, normalizedDir)
      : normalizedDir || config.rootDir;
  const path = joinPath(fullDir, finalFile);
  const date = formatInTimeZone(new Date(), settings.content.timezone);
  const messageTitle = showTitle ? title.trim() || undefined : finalFile ? resolveCommitTitle('', path) : undefined;
  const message = renderCommitMessage(settings.commit.create, {
    path,
    action: 'create',
    date,
    title: messageTitle,
  });
  const collision = Boolean(model?.files.some((file) => file.path === path));

  const handleCreate = async (): Promise<void> => {
    if (parking || confirming) return;
    if (showTitle && !title.trim()) {
      setError(t('shell.newPost.errors.titleRequired'));
      return;
    }
    if (!finalFile) {
      setError(t('shell.newPost.errors.filenameRequired'));
      return;
    }
    if (collision) {
      setError(t('shell.newPost.errors.pathTaken'));
      return;
    }
    const existing = usePendingPost.getState().draft;
    if (existing) {
      setConfirming(true);
      const confirmed = await confirmAction(t('shell.newPost.existingDraft.title'), {
        description: t('shell.newPost.existingDraft.description'),
        confirmLabel: t('shell.newPost.existingDraft.confirm'),
        cancelLabel: t('shell.newPost.existingDraft.cancel'),
      });
      setConfirming(false);
      if (!confirmed) return;
      setParking(true);
      const result = await parkPendingDraft();
      setParking(false);
      if (result === 'failed') {
        setError(t('shell.newPost.errors.parkFailed'));
        return;
      }
    }

    const text = buildNewPostDocument(settings.frontmatter.fields, { title: showTitle ? title.trim() : '', date });
    setPendingDraft({ path, text });
    onOpenChange(false);
    navigate(`/edit?path=${encodeURIComponent(path)}&new=1`);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // 关闭草稿框等于放弃这次新建：顺带把还没回答的确认按「取消」收口。
        if (!next) dismissConfirm();
        onOpenChange(next);
      }}
      modal={!confirming}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--abs-overlay)] backdrop-blur-[2px] data-[state=open]:animate-[abs-pop_160ms_ease-out]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(600px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop outline-none"
          onInteractOutside={(event) => {
            // 确认条在 Dialog 之外：点它不算「离开弹窗」，否则选「先不新建」也会把草稿框关掉。
            if (event.target instanceof Element && event.target.closest('[data-abs-confirm]')) {
              event.preventDefault();
            }
          }}
        >
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
            {showTitle ? (
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
                <span className="font-mono">
                  {showTitle ? t('shell.newPost.filenameHint') : t('shell.newPost.filenameHintRequired')}
                </span>
              }
            >
              <input
                className="abs-input font-mono text-[11px]"
                value={filename}
                onChange={(event) => {
                  setFilename(event.target.value);
                  setError(null);
                }}
                placeholder={safeName ? `${safeName}.md` : 'filename.md'}
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

          {error ? (
            <p
              className="mt-3 rounded-lg border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2 text-[11px] text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Dialog.Close className="abs-btn abs-btn-ghost h-8 text-[11px]">{t('common.cancel')}</Dialog.Close>
            <button
              type="button"
              className="abs-btn abs-btn-primary h-8 text-[11px]"
              onClick={() => void handleCreate()}
              disabled={parking || confirming}
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
