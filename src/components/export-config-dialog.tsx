import * as Dialog from '@radix-ui/react-dialog';
import { Download, X } from 'lucide-react';
import { useState } from 'react';
import { Field, Spinner } from '@/components/ui';
import type { ConfigExportSource } from '@/lib/config/export';
import { useT } from '@/lib/i18n/react';

export interface ExportConfigMeta {
  source: ConfigExportSource;
  repoCount: number;
  tokenCount: number;
  missing: string[];
  requiresPassword: boolean;
}

type ExportPhase = 'warning' | 'password';

export function ExportConfigDialog({
  meta,
  dirty,
  onClose,
  onExport,
}: {
  meta: ExportConfigMeta;
  dirty: boolean;
  onClose: () => void;
  onExport: (password?: string) => Promise<void>;
}) {
  const t = useT();
  const [phase, setPhase] = useState<ExportPhase>('warning');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runExport = async (value?: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onExport(value);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.export.failed'));
    } finally {
      setBusy(false);
    }
  };

  const continueExport = (): void => {
    if (meta.missing.length > 0) return;
    if (meta.requiresPassword) {
      setError(null);
      setPhase('password');
      return;
    }
    void runExport();
  };

  const submitPassword = (): void => {
    if (!password) {
      setError(t('settings.export.passwordRequired'));
      return;
    }
    void runExport(password);
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      modal
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--abs-overlay)] backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-24px)] w-[min(480px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop outline-none"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">
                <Download aria-hidden className="size-3.5" />
                export config
              </p>
              <Dialog.Title className="font-display text-[21px] font-bold leading-tight">
                {phase === 'password' ? t('settings.export.passwordTitle') : t('settings.export.title')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 break-all text-[11px] leading-relaxed text-muted">
                {phase === 'password' ? t('settings.export.passwordDescription') : t('settings.export.description')}
              </Dialog.Description>
            </div>
            <Dialog.Close className="abs-icon-btn" aria-label={t('common.close')} disabled={busy}>
              <X aria-hidden className="size-3.5" />
            </Dialog.Close>
          </div>

          {phase === 'warning' ? (
            <>
              {meta.source === 'live' ? (
                <div className="mt-3 rounded-xl border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-danger">{t('settings.export.warningTitle')}</p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{t('settings.export.warningBody')}</p>
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-dashed border-line bg-paper-2 px-3 py-2 text-[10.5px] leading-relaxed text-muted">
                  {t('settings.export.demoNote')}
                </p>
              )}

              {meta.source === 'live' ? (
                <p className="mt-2 font-mono text-[10px] text-muted">
                  {t('settings.export.counts', { repos: meta.repoCount, tokens: meta.tokenCount })}
                </p>
              ) : null}

              {dirty ? (
                <p className="mt-2 rounded-lg border border-dashed border-edge bg-paper-2 px-3 py-2 text-[10.5px] leading-relaxed text-muted">
                  {t('settings.export.dirtyNote')}
                </p>
              ) : null}

              {meta.missing.length > 0 ? (
                <p
                  className="mt-2 rounded-lg border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2 text-[11px] text-danger"
                  role="alert"
                >
                  {t('settings.export.missingPat', { repos: meta.missing.join(', ') })}
                </p>
              ) : null}
            </>
          ) : (
            <Field label={t('settings.export.passwordLabel')} hint={t('settings.export.passwordHint')} className="mt-4">
              <input
                className="abs-input font-mono text-[11px]"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('settings.export.passwordPlaceholder')}
                autoComplete="current-password"
                spellCheck={false}
              />
            </Field>
          )}

          {error ? (
            <p
              className="mt-3 rounded-lg border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2 text-[11px] text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <Dialog.Close className="abs-btn abs-btn-ghost h-8 text-[11px]" disabled={busy}>
              {t('common.cancel')}
            </Dialog.Close>
            {phase === 'warning' ? (
              <button
                type="button"
                className="abs-btn h-8 text-[11px]"
                onClick={continueExport}
                disabled={busy || meta.missing.length > 0}
              >
                {busy ? <Spinner label={t('settings.export.busy')} /> : t('settings.export.continue')}
              </button>
            ) : (
              <button type="button" className="abs-btn h-8 text-[11px]" onClick={submitPassword} disabled={busy}>
                {busy ? <Spinner label={t('settings.export.busy')} /> : t('settings.export.verify')}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
