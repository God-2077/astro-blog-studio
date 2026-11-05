import * as Dialog from '@radix-ui/react-dialog';
import { KeyRound, X } from 'lucide-react';
import { useState } from 'react';
import { Field, Spinner } from '@/components/ui';
import type { RepoProfile } from '@/lib/config/schema';
import { useT } from '@/lib/i18n/react';

export function RepoTokenDialog({
  profile,
  onClose,
  onSubmit,
}: {
  profile: RepoProfile;
  onClose: () => void;
  onSubmit: (token: string) => Promise<void>;
}) {
  const t = useT();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (busy) return;
    const value = token.trim();
    if (!value) {
      setError(t('errors.repo.newTokenRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
      setToken('');
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">
                <KeyRound aria-hidden className="size-3.5" />
                repository token
              </p>
              <Dialog.Title className="font-display text-[21px] font-bold leading-tight">
                {t('dialogs.repoToken.title')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 break-all text-[11px] leading-relaxed text-muted">
                <span className="font-mono">
                  {profile.owner}/{profile.name}@{profile.branch}
                </span>
                <br />
                {t('dialogs.repoToken.description')}
              </Dialog.Description>
            </div>
            <Dialog.Close className="abs-icon-btn" aria-label={t('common.close')}>
              <X aria-hidden className="size-3.5" />
            </Dialog.Close>
          </div>

          <Field
            label={t('dialogs.repoToken.label')}
            hint={<span className="font-mono">{t('dialogs.repoToken.hint')}</span>}
            className="mt-4"
          >
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

          {error ? (
            <p
              className="mt-3 rounded-lg border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2 text-[11px] text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <Dialog.Close className="abs-btn abs-btn-ghost h-8 text-[11px]">{t('common.cancel')}</Dialog.Close>
            <button type="button" className="abs-btn h-8 text-[11px]" onClick={() => void submit()} disabled={busy}>
              {busy ? <Spinner label={t('dialogs.repoToken.busy')} /> : t('dialogs.repoToken.submit')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
