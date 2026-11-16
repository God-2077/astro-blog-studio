import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowRight, BookOpen, FilePlus2, FileText, Newspaper, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { filenameIssueMessage } from '@/components/new-post-dialog';
import { Field } from '@/components/ui';
import { useParkPendingDraft } from '@/hooks/use-pending-draft';
import { buildDaybookDocument, DAYBOOK_DIRS, DAYBOOK_KINDS, type DaybookKind, nextDailyFilename } from '@/lib/daybook/model';
import { type TFunction, useT } from '@/lib/i18n/react';
import { renderCommitMessage, resolveCommitTitle } from '@/lib/paths/commit-message';
import { resolveManualFilename, resolveTitleFilename } from '@/lib/paths/filename';
import { joinPath } from '@/lib/paths/paths';
import type { TreeModel } from '@/lib/tree/model';
import { dateOnlyInTimeZone } from '@/lib/utils/date';
import { usePendingPost } from '@/stores/pending-post';
import { useSettings } from '@/stores/settings';

function kindLabel(t: TFunction, kind: DaybookKind): string {
  if (kind === 'daily') return t('dialogs.daybook.daily');
  if (kind === 'post') return t('dialogs.daybook.post');
  return t('dialogs.daybook.page');
}

function kindHint(t: TFunction, kind: DaybookKind): string {
  if (kind === 'daily') return t('dialogs.daybook.dailyHint');
  if (kind === 'post') return t('dialogs.daybook.postHint');
  return t('dialogs.daybook.pageHint');
}

function createTitle(t: TFunction, kind: DaybookKind): string {
  if (kind === 'daily') return t('dialogs.daybook.createTitleDaily');
  if (kind === 'post') return t('dialogs.daybook.createTitlePost');
  return t('dialogs.daybook.createTitlePage');
}

function kindIcon(kind: DaybookKind) {
  if (kind === 'daily') return BookOpen;
  if (kind === 'post') return Newspaper;
  return FileText;
}

export function DaybookNewDialog({
  open,
  onOpenChange,
  model,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: TreeModel | null;
}) {
  const t = useT();
  const settings = useSettings();
  const navigate = useNavigate();
  const setPendingDraft = usePendingPost((state) => state.setDraft);
  const parkPendingDraft = useParkPendingDraft();
  const [step, setStep] = useState<'choose' | 'create'>('choose');
  const [kind, setKind] = useState<DaybookKind | null>(null);
  const [title, setTitle] = useState('');
  const [filename, setFilename] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [parking, setParking] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const filenameRef = useRef<HTMLInputElement>(null);

  const date = dateOnlyInTimeZone(new Date(), settings.content.timezone);

  useEffect(() => {
    if (!open) return;
    setStep('choose');
    setKind(null);
    setTitle('');
    setFilename('');
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || step !== 'create' || !kind) return;
    if (kind === 'daily') filenameRef.current?.focus();
    else titleRef.current?.focus();
  }, [open, step, kind]);

  const begin = (next: DaybookKind): void => {
    if (!model) return;
    setKind(next);
    setStep('create');
    setTitle('');
    setError(null);
    setFilename(
      next === 'daily'
        ? nextDailyFilename(
            model.files.map((file) => file.path),
            date,
          )
        : '',
    );
  };

  const back = (): void => {
    setStep('choose');
    setKind(null);
    setTitle('');
    setFilename('');
    setError(null);
  };

  const usesTitle = kind !== null && kind !== 'daily' && filename.trim().length === 0;
  const resolution = usesTitle ? resolveTitleFilename(title) : resolveManualFilename(filename);
  const finalFile = resolution.filename;
  const path = kind && finalFile ? joinPath(DAYBOOK_DIRS[kind], finalFile) : '';
  const collision = Boolean(path && model?.files.some((file) => file.path === path));
  const unsupported = resolution.unsupportedSuffix;
  const messageTitle = title.trim() || (finalFile ? resolveCommitTitle('', path) : undefined);
  const message = renderCommitMessage(settings.commit.create, {
    path,
    action: 'create',
    date,
    title: messageTitle,
  });

  const liveIssue = !usesTitle && filename.trim().length > 0 ? resolution.issue : null;
  const liveError = liveIssue ? filenameIssueMessage(liveIssue, t) : unsupported ? t('dialogs.daybook.unsupportedFile') : null;
  const shownError = error ?? liveError;

  const handleCreate = async (): Promise<void> => {
    if (parking || !kind) return;
    if (!model) {
      setError(t('dialogs.daybook.indexLoading'));
      return;
    }
    if (kind !== 'daily' && !title.trim()) {
      setError(t('shell.newPost.errors.titleRequired'));
      return;
    }
    if (resolution.issue) {
      setError(filenameIssueMessage(resolution.issue, t));
      return;
    }
    if (unsupported) {
      setError(t('dialogs.daybook.unsupportedFile'));
      return;
    }
    if (collision) {
      setError(t('shell.newPost.errors.pathTaken'));
      return;
    }

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

    setPendingDraft({ path, text: buildDaybookDocument(kind, { title: title.trim(), date }) });
    onOpenChange(false);
    navigate(`/edit?path=${encodeURIComponent(path)}&new=1`);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--abs-overlay)] backdrop-blur-[2px] data-[state=open]:animate-[abs-pop_160ms_ease-out]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-24px)] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop outline-none">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              {step === 'create' ? (
                <button
                  type="button"
                  className="abs-icon-btn mt-0.5 shrink-0"
                  onClick={back}
                  aria-label={t('dialogs.daybook.back')}
                >
                  <ArrowLeft aria-hidden className="size-3.5" />
                </button>
              ) : null}
              <div className="min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">
                  daybook{kind ? ` · ${kindLabel(t, kind)}` : ''}
                </p>
                <Dialog.Title className="font-display text-[22px] font-bold leading-tight">
                  {kind ? createTitle(t, kind) : t('dialogs.daybook.chooserTitle')}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-[11px] leading-relaxed text-muted">
                  {kind ? t('dialogs.daybook.fixedDirHint') : t('dialogs.daybook.chooserDescription')}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="abs-icon-btn" aria-label={t('common.close')}>
              <X aria-hidden className="size-3.5" />
            </Dialog.Close>
          </div>

          {step === 'choose' || !kind ? (
            <>
              <div className="mt-4 grid gap-2">
                {DAYBOOK_KINDS.map((option) => {
                  const Icon = kindIcon(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper-2 px-3.5 py-3 text-left transition-colors hover:border-edge enabled:hover:bg-blush-2/40 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => begin(option)}
                      disabled={!model}
                    >
                      <Icon aria-hidden className="size-4 shrink-0 text-sakura" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[14px] font-bold">{kindLabel(t, option)}</span>
                        <span className="mt-0.5 block font-mono text-[9.5px] leading-relaxed text-muted">
                          {kindHint(t, option)}
                        </span>
                      </span>
                      <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted" />
                    </button>
                  );
                })}
              </div>
              {!model ? (
                <p className="mt-3 rounded-lg border border-dashed border-line bg-paper-2 px-3 py-2 text-[10.5px] text-muted">
                  {t('dialogs.daybook.indexLoading')}
                </p>
              ) : null}
              <div className="mt-5 flex items-center justify-end">
                <Dialog.Close className="abs-btn abs-btn-ghost h-8 text-[11px]">{t('common.cancel')}</Dialog.Close>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field
                  label={kind === 'daily' ? t('dialogs.daybook.titleOptional') : t('shell.newPost.titleLabel')}
                  className="sm:col-span-2"
                >
                  <input
                    ref={titleRef}
                    className="abs-input"
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setError(null);
                    }}
                    placeholder={t('shell.newPost.titlePlaceholder')}
                    aria-required={kind === 'daily' ? undefined : true}
                  />
                </Field>
                <Field
                  label={t('shell.newPost.dirLabel')}
                  hint={<span className="font-mono">{t('dialogs.daybook.fixedDirHint')}</span>}
                >
                  <input className="abs-input font-mono text-[11px]" value={DAYBOOK_DIRS[kind]} disabled readOnly />
                </Field>
                <Field
                  label={t('shell.newPost.filenameLabel')}
                  hint={
                    <span className="font-mono">
                      {kind === 'daily' ? t('dialogs.daybook.filenameAutoHint') : t('shell.newPost.filenameHint')}
                    </span>
                  }
                >
                  <input
                    ref={filenameRef}
                    className="abs-input font-mono text-[11px]"
                    value={filename}
                    onChange={(event) => {
                      setFilename(event.target.value);
                      setError(null);
                    }}
                    placeholder={finalFile || 'filename.md'}
                    aria-required={kind === 'daily' ? true : undefined}
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

              <div className="mt-5 flex items-center justify-between gap-2">
                <button type="button" className="abs-btn abs-btn-ghost h-8 text-[11px]" onClick={back}>
                  <ArrowLeft aria-hidden className="size-3.5" />
                  {t('dialogs.daybook.back')}
                </button>
                <div className="flex items-center gap-2">
                  <Dialog.Close className="abs-btn abs-btn-ghost h-8 text-[11px]">{t('common.cancel')}</Dialog.Close>
                  <button
                    type="button"
                    className="abs-btn abs-btn-primary h-8 text-[11px]"
                    onClick={() => void handleCreate()}
                    disabled={parking || !model}
                  >
                    <FilePlus2 aria-hidden className="size-3.5" />
                    {parking ? t('shell.newPost.parking') : t('shell.newPost.start')}
                  </button>
                </div>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
