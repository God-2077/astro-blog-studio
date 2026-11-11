import { Fingerprint, KeyRound, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { confirmAction } from '@/components/confirm-toast';
import { Spinner } from '@/components/ui';
import { type TFunction, useT } from '@/lib/i18n/react';
import { resolveUnlockReturn } from '@/lib/navigation/unlock-return';
import type { VaultModeState } from '@/lib/vault/mode';
import { useVault } from '@/stores/vault';

function modeDescription(t: TFunction, mode: VaultModeState | null): string {
  switch (mode) {
    case 'device':
      return t('unlock.modeDescription.device');
    case 'password':
      return t('unlock.modeDescription.password');
    case 'two-factor':
      return t('unlock.modeDescription.twoFactor');
    case 'legacy-mixed':
      return t('unlock.modeDescription.legacyMixed');
    default:
      return t('unlock.modeDescription.unknown');
  }
}

export function UnlockPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = resolveUnlockReturn(location.state);
  const vault = useVault();
  const t = useT();
  const [password, setPassword] = useState('');

  // 自动指纹解锁每次挂载只尝试一次：失败时把错误留在页面上，由用户决定重试或重置，
  // 绝不能因为 busy 状态翻转而无限重试（那会占满主线程并让提示永远看不见）。
  const autoUnlockAttempted = useRef(false);
  useEffect(() => {
    if (autoUnlockAttempted.current) return;
    if (vault.status !== 'locked' || vault.mode !== 'device') return;
    autoUnlockAttempted.current = true;
    void vault.unlockDevice();
  }, [vault.status, vault.mode, vault.unlockDevice]);

  if (vault.status === 'empty') return <Navigate to="/setup" replace />;
  if (vault.status === 'unlocked') return <Navigate to={returnTo} replace />;

  const mode = vault.mode;
  const needsPassword = mode === 'password' || mode === 'two-factor' || mode === 'legacy-mixed';

  const finishUnlock = (): void => {
    if (useVault.getState().status === 'unlocked') navigate(returnTo, { replace: true });
  };

  const handleUnlock = async (): Promise<void> => {
    await vault.unlockPassword(password);
    finishUnlock();
  };

  const handleDevice = async (): Promise<void> => {
    await vault.unlockDevice();
    finishUnlock();
  };

  const handleReset = async (): Promise<void> => {
    const confirmed = await confirmAction(t('unlock.resetConfirm.message'), {
      description: t('unlock.resetConfirm.description'),
      confirmLabel: t('unlock.reset'),
      danger: true,
    });
    if (!confirmed) return;
    await vault.reset();
    navigate('/setup', { replace: true });
  };

  return (
    <div className="abs-shell flex min-h-screen items-center justify-center py-8">
      <div className="grid w-full max-w-[760px] gap-4 sm:grid-cols-[minmax(0,1fr)_240px]">
        <div className="relative rounded-[22px] border-[1.5px] border-edge bg-paper px-7 pb-6 pt-9 text-center shadow-sheet">
          <span className="abs-tape" aria-hidden />
          <div className="mx-auto mb-3 grid size-16 -rotate-6 place-items-center rounded-full border-2 border-sakura font-display text-[26px] font-bold text-sakura shadow-[inset_0_0_0_4px_var(--abs-paper),inset_0_0_0_5px_var(--abs-stamp-ring)]">
            {t('unlock.seal')}
          </div>
          <h1 className="font-display text-[28px] font-bold">{t('unlock.title')}</h1>
          <p className="mx-auto mt-1 max-w-[36ch] text-[11.5px] leading-relaxed text-ink-soft">{modeDescription(t, mode)}</p>

          {needsPassword ? (
            <form
              className="mt-5 text-left"
              onSubmit={(event) => {
                event.preventDefault();
                void handleUnlock();
              }}
            >
              <label className="abs-field">
                <span>{t('unlock.password.label')}</span>
                <input
                  className="abs-input font-mono text-[14px] tracking-[0.2em]"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  aria-label={t('unlock.password.aria')}
                />
              </label>
              <button type="submit" className="abs-btn abs-btn-primary mt-3 w-full" disabled={vault.busy}>
                {vault.busy ? (
                  <Spinner label={t('unlock.submit.busy')} />
                ) : (
                  <>
                    <KeyRound aria-hidden className="size-3.5" />
                    {t('unlock.submit.idle')}
                  </>
                )}
              </button>
            </form>
          ) : mode === 'device' ? (
            <div className="mt-5">
              <button
                type="button"
                className="abs-btn abs-btn-primary w-full"
                onClick={() => void handleDevice()}
                disabled={vault.busy}
              >
                {vault.busy ? (
                  <Spinner label={t('unlock.deviceUnlock.busy')} />
                ) : (
                  <>
                    <Fingerprint aria-hidden className="size-3.5" />
                    {t('unlock.deviceUnlock.idle')}
                  </>
                )}
              </button>
            </div>
          ) : null}

          {mode === 'legacy-mixed' ? (
            <button
              type="button"
              className="abs-btn abs-btn-ghost mt-2 w-full"
              onClick={() => void handleDevice()}
              disabled={vault.busy}
            >
              <Fingerprint aria-hidden className="size-3.5" />
              {t('unlock.legacyDeviceUnlock')}
            </button>
          ) : null}

          {mode === 'two-factor' ? (
            <p className="mt-3 rounded-lg border border-dashed border-line bg-paper-2 px-3 py-2 text-[10px] leading-relaxed text-muted">
              {t('unlock.twoFactorNote')}
            </p>
          ) : null}

          {vault.error ? (
            <p
              className="mt-3 rounded-lg border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2 text-[11px] text-danger"
              role="alert"
            >
              {vault.error}
            </p>
          ) : null}

          <p className="mt-4 border-t border-dashed border-line pt-3 font-mono text-[9px] leading-relaxed text-muted">
            {t('unlock.footer.line1')}
            <br />
            {t('unlock.footer.line2')}
          </p>

          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1 font-mono text-[9px] text-muted underline decoration-dashed underline-offset-2 hover:text-sakura"
            onClick={() => void handleReset()}
          >
            <RotateCcw aria-hidden className="size-3" />
            {t('unlock.reset')}
          </button>
        </div>

        <aside className="hidden flex-col gap-2.5 sm:flex">
          <div className="rounded-xl border border-line bg-paper px-3.5 py-3 text-[10.5px] leading-relaxed text-ink-soft">
            <strong className="block font-display text-[12px] text-ink">{t('unlock.aside.device.title')}</strong>
            {t('unlock.aside.device.body')}
          </div>
          <div className="rotate-[1.2deg] rounded-xl border border-line bg-paper px-3.5 py-3 text-[10.5px] leading-relaxed text-ink-soft">
            <strong className="block font-display text-[12px] text-ink">{t('unlock.aside.twoFactor.title')}</strong>
            {t('unlock.aside.twoFactor.body')}
          </div>
          <div className="-rotate-[0.8deg] rounded-xl border border-line bg-paper px-3.5 py-3 text-[10.5px] leading-relaxed text-ink-soft">
            <strong className="block font-display text-[12px] text-ink">{t('unlock.aside.readOnly.title')}</strong>
            {t('unlock.aside.readOnly.body')}
          </div>
          <Link
            to="/?demo=1"
            className="mt-auto text-center font-mono text-[9px] text-muted underline decoration-dashed underline-offset-2 hover:text-sakura"
          >
            {t('unlock.demo')}
          </Link>
        </aside>
      </div>
    </div>
  );
}
