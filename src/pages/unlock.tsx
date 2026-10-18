import { Fingerprint, KeyRound, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useVault } from '@/stores/vault';

export function UnlockPage() {
  const navigate = useNavigate();
  const vault = useVault();
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (vault.status === 'locked' && vault.hasDevice && !vault.hasPassword && !vault.busy) {
      void vault.unlockDevice();
    }
  }, [vault.status, vault.hasDevice, vault.hasPassword, vault.busy, vault.unlockDevice]);

  if (vault.status === 'empty') return <Navigate to="/setup" replace />;
  if (vault.status === 'unlocked') return <Navigate to="/" replace />;

  const handleUnlock = async (): Promise<void> => {
    await vault.unlockPassword(password);
    if (useVault.getState().status === 'unlocked') navigate('/', { replace: true });
  };

  const handleReset = (): void => {
    if (!window.confirm('重置保险库会删除本机保存的令牌，需要重新输入 PAT。继续吗？')) return;
    vault.reset();
    navigate('/setup', { replace: true });
  };

  return (
    <div className="abs-shell flex min-h-screen items-center justify-center py-8">
      <div className="grid w-full max-w-[760px] gap-4 sm:grid-cols-[minmax(0,1fr)_240px]">
        <div className="relative rounded-[22px] border-[1.5px] border-ink bg-paper px-7 pb-6 pt-9 text-center shadow-sheet">
          <span className="abs-tape" aria-hidden />
          <div className="mx-auto mb-3 grid size-16 -rotate-6 place-items-center rounded-full border-2 border-sakura font-display text-[26px] font-bold text-sakura shadow-[inset_0_0_0_4px_var(--abs-paper),inset_0_0_0_5px_rgba(201,63,109,.25)]">
            樱
          </div>
          <h1 className="font-display text-[28px] font-bold">欢迎回来</h1>
          <p className="mx-auto mt-1 max-w-[34ch] text-[11.5px] leading-relaxed text-ink-soft">
            保险库还在这台设备上。输入密码，或者直接用指纹揭开。
          </p>

          {vault.hasPassword ? (
            <form
              className="mt-5 text-left"
              onSubmit={(event) => {
                event.preventDefault();
                void handleUnlock();
              }}
            >
              <label className="abs-field">
                <span>password</span>
                <input
                  className="abs-input font-mono text-[14px] tracking-[0.2em]"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  aria-label="密码"
                />
              </label>
              <button type="submit" className="abs-btn abs-btn-primary mt-3 w-full" disabled={vault.busy}>
                {vault.busy ? (
                  <Spinner label="验证中…" />
                ) : (
                  <>
                    <KeyRound aria-hidden className="size-3.5" />
                    揭开封印
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="mt-5">
              <button
                type="button"
                className="abs-btn abs-btn-primary w-full"
                onClick={() => void vault.unlockDevice()}
                disabled={vault.busy}
              >
                {vault.busy ? (
                  <Spinner label="校验设备…" />
                ) : (
                  <>
                    <Fingerprint aria-hidden className="size-3.5" />
                    用设备指纹解锁
                  </>
                )}
              </button>
            </div>
          )}

          {vault.hasDevice && vault.hasPassword ? (
            <button
              type="button"
              className="abs-btn abs-btn-ghost mt-2 w-full"
              onClick={() => void vault.unlockDevice()}
              disabled={vault.busy}
            >
              <Fingerprint aria-hidden className="size-3.5" />
              用设备指纹自动解锁
            </button>
          ) : null}

          {vault.error ? (
            <p className="mt-3 rounded-lg border border-danger/30 bg-white/70 px-3 py-2 text-[11px] text-danger" role="alert">
              {vault.error}
            </p>
          ) : null}

          <p className="mt-4 border-t border-dashed border-line pt-3 font-mono text-[9px] leading-relaxed text-muted">
            令牌只在本机解密 · 锁定即清空内存与缓存
            <br />
            忘记密码 = 重新输入 PAT
          </p>

          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1 font-mono text-[9px] text-muted underline decoration-dashed underline-offset-2 hover:text-sakura"
            onClick={handleReset}
          >
            <RotateCcw aria-hidden className="size-3" />
            重置保险库
          </button>
        </div>

        <aside className="hidden flex-col gap-2.5 sm:flex">
          <div className="rounded-xl border border-line bg-paper px-3.5 py-3 text-[10.5px] leading-relaxed text-ink-soft">
            <strong className="block font-display text-[12px] text-ink">设备绑定</strong>
            指纹只在本机计算，不发送到任何服务器。
          </div>
          <div className="rotate-[1.2deg] rounded-xl border border-line bg-paper px-3.5 py-3 text-[10.5px] leading-relaxed text-ink-soft">
            <strong className="block font-display text-[12px] text-ink">密码可选</strong>
            设置密码后，每次新标签页都需要验证。
          </div>
          <div className="-rotate-[0.8deg] rounded-xl border border-line bg-paper px-3.5 py-3 text-[10.5px] leading-relaxed text-ink-soft">
            <strong className="block font-display text-[12px] text-ink">只读也安心</strong>
            只读令牌不会显示任何写操作。
          </div>
          <Link
            to="/?demo=1"
            className="mt-auto text-center font-mono text-[9px] text-muted underline decoration-dashed underline-offset-2 hover:text-sakura"
          >
            先看演示
          </Link>
        </aside>
      </div>
    </div>
  );
}
