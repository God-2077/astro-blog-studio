import { KeyRound, LockKeyhole, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Field, Spinner } from '@/components/ui';
import type { RepoConfig } from '@/lib/config/schema';
import { mapError } from '@/lib/github/errors';
import { LiveGateway } from '@/lib/github/live';
import { useT } from '@/lib/i18n/react';
import { unlockReturnState } from '@/lib/navigation/unlock-return';
import { repoTokenKey } from '@/lib/repos/identity';
import { useVault } from '@/stores/vault';

/**
 * Recovery screen for the rare case where the active repository has no PAT in
 * the vault (for example partially restored local data). Normal add/switch flows
 * always write the token before activating a repository.
 */
export function MissingRepoToken({ repo }: { repo: RepoConfig }) {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const value = token.trim();
    if (!value) {
      setError(t('errors.repo.tokenRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const gateway = new LiveGateway({
        token: value,
        owner: repo.owner,
        name: repo.name,
        branch: repo.branch,
      });
      await gateway.getRepo();
      await useVault.getState().addRepoToken(repoTokenKey(repo), value);
      setToken('');
    } catch (caught) {
      const mapped = mapError(caught);
      setError(mapped.code === 'UNKNOWN' && caught instanceof Error ? caught.message : (mapped.detail ?? mapped.message));
    } finally {
      setBusy(false);
    }
  };

  const lock = async (): Promise<void> => {
    await useVault.getState().lock();
    navigate('/unlock', { state: unlockReturnState(location) });
  };

  return (
    <div className="abs-shell flex min-h-screen items-center justify-center py-8">
      <div className="abs-sheet w-full max-w-[520px] p-5 sm:p-7">
        <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">
          <ShieldAlert aria-hidden className="size-3.5" />
          missing token
        </p>
        <h1 className="mt-1 font-display text-[26px] font-bold leading-tight">{t('dialogs.missingToken.title')}</h1>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          {t('dialogs.missingToken.descriptionBefore')}{' '}
          <span className="font-mono">
            {repo.owner}/{repo.name}@{repo.branch}
          </span>{' '}
          {t('dialogs.missingToken.descriptionAfter')}
        </p>

        <Field
          label={t('dialogs.missingToken.label')}
          hint={<span className="font-mono">{t('dialogs.missingToken.hint')}</span>}
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

        <button type="button" className="abs-btn mt-4" onClick={() => void submit()} disabled={busy}>
          {busy ? (
            <Spinner label={t('dialogs.missingToken.busy')} />
          ) : (
            <>
              <KeyRound aria-hidden className="size-3.5" />
              {t('dialogs.missingToken.submit')}
            </>
          )}
        </button>
        <button type="button" className="abs-btn abs-btn-ghost mt-2 text-[10.5px]" onClick={() => void lock()}>
          <LockKeyhole aria-hidden className="size-3" />
          {t('dialogs.missingToken.lock')}
        </button>
      </div>
    </div>
  );
}
