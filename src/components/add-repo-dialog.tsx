import * as Dialog from '@radix-ui/react-dialog';
import { GitBranch, KeyRound, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Field, Spinner } from '@/components/ui';
import type { AddRepoInput } from '@/hooks/use-repo-manager';
import { useT } from '@/lib/i18n/react';

export interface AddRepoDefaults {
  rootDir: string;
  excludes: string;
}

export function AddRepoDialog({
  defaults,
  onClose,
  onSubmit,
}: {
  defaults: AddRepoDefaults;
  onClose: () => void;
  onSubmit: (input: AddRepoInput) => Promise<void>;
}) {
  const t = useT();
  const [repoInput, setRepoInput] = useState('');
  const [branch, setBranch] = useState('');
  const [token, setToken] = useState('');
  const [rootDir, setRootDir] = useState(defaults.rootDir || 'src');
  const [excludes, setExcludes] = useState(defaults.excludes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (busy) return;
    if (!repoInput.trim()) {
      setError(t('dialogs.addRepo.repoRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ repoInput, branch, token, rootDir, excludes });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? null : onClose())} modal>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--abs-overlay)] backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-24px)] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">
                <GitBranch aria-hidden className="size-3.5" />
                add repository
              </p>
              <Dialog.Title className="font-display text-[22px] font-bold leading-tight">
                {t('dialogs.addRepo.title')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[11px] leading-relaxed text-muted">
                {t('dialogs.addRepo.description')}
              </Dialog.Description>
            </div>
            <Dialog.Close className="abs-icon-btn" aria-label={t('common.close')}>
              <X aria-hidden className="size-3.5" />
            </Dialog.Close>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label={t('dialogs.addRepo.repo')}
              hint={<span className="font-mono">{t('dialogs.addRepo.repoHint')}</span>}
              className="sm:col-span-2"
            >
              <input
                className="abs-input font-mono text-[11px]"
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                placeholder="God-2077/astro-blog-content"
                spellCheck={false}
              />
            </Field>
            <Field
              label={t('dialogs.addRepo.branch')}
              hint={<span className="font-mono">{t('dialogs.addRepo.branchHint')}</span>}
            >
              <input
                className="abs-input font-mono text-[11px]"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="main"
                spellCheck={false}
              />
            </Field>
            <Field label={t('dialogs.addRepo.pat')} hint={<span className="font-mono">{t('dialogs.addRepo.patHint')}</span>}>
              <input
                className="abs-input font-mono text-[11px]"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="github_pat_…"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field
              label={t('dialogs.addRepo.rootDir')}
              hint={<span className="font-mono">{t('dialogs.addRepo.rootDirHint')}</span>}
            >
              <input
                className="abs-input font-mono text-[11px]"
                value={rootDir}
                onChange={(event) => setRootDir(event.target.value)}
                placeholder="src"
              />
            </Field>
            <Field
              label={t('dialogs.addRepo.excludes')}
              hint={<span className="font-mono">{t('dialogs.addRepo.excludesHint')}</span>}
            >
              <textarea
                className="abs-textarea min-h-[84px] font-mono text-[10.5px]"
                value={excludes}
                onChange={(event) => setExcludes(event.target.value)}
              />
            </Field>
          </div>

          <p className="mt-3 rounded-lg border border-dashed border-line bg-paper-2 px-3 py-2 text-[10px] leading-relaxed text-muted">
            {t('dialogs.addRepo.note')}
          </p>

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
            <button type="button" className="abs-btn h-8 text-[11px]" onClick={() => void submit()} disabled={busy}>
              {busy ? (
                <Spinner label={t('dialogs.addRepo.busy')} />
              ) : (
                <>
                  <Plus aria-hidden className="size-3.5" />
                  {t('dialogs.addRepo.submit')}
                </>
              )}
            </button>
          </div>
          <p className="mt-3 flex items-center gap-1 font-mono text-[9px] text-muted">
            <KeyRound aria-hidden className="size-3" />
            {t('dialogs.addRepo.patFooter')}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
