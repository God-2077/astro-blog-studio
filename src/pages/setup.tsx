import { ArrowRight, ArrowUpRight, Github, KeyRound, NotebookPen, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Field, Spinner } from '@/components/ui';
import { UnlockModePicker } from '@/components/unlock-mode-picker';
import { APP_DESCRIPTION, APP_NAME, APP_URL, APP_URL_LABEL } from '@/lib/config/app-meta';
import { SUGGESTED_EXCLUDES } from '@/lib/config/defaults';
import { mapError } from '@/lib/github/errors';
import { LiveGateway } from '@/lib/github/live';
import { parseRepoInput } from '@/lib/github/repo-input';
import { MIN_VAULT_PASSWORD_LENGTH, modeNeedsPassword, type VaultMode } from '@/lib/vault/mode';
import { useSettings } from '@/stores/settings';
import { useVault } from '@/stores/vault';

export function SetupPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const vault = useVault();
  const [token, setToken] = useState('');
  const [repoInput, setRepoInput] = useState('');
  const [branch, setBranch] = useState('');
  const [rootDir, setRootDir] = useState(settings.content.rootDir || 'src');
  const [excludes, setExcludes] = useState(SUGGESTED_EXCLUDES.join('\n'));
  const [password, setPassword] = useState('');
  const [unlockMode, setUnlockMode] = useState<VaultMode>('device');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (vault.status === 'unlocked' && settings.repo) navigate('/', { replace: true });
  }, [vault.status, settings.repo, navigate]);

  if (vault.status === 'locked') return <Navigate to="/unlock" replace />;
  if (vault.status === 'unlocked' && settings.repo) return <Navigate to="/" replace />;

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    const parsed = parseRepoInput(repoInput);
    if (!token.trim()) return setError('请先粘贴 GitHub PAT。');
    if (!parsed) return setError('仓库格式应为 owner/repository，或完整的 GitHub URL。');
    if (modeNeedsPassword(unlockMode) && password.length < MIN_VAULT_PASSWORD_LENGTH) {
      return setError(`密码至少 ${MIN_VAULT_PASSWORD_LENGTH} 位。`);
    }
    setBusy(true);
    try {
      const branchValue = branch.trim() || 'main';
      const gateway = new LiveGateway({
        token: token.trim(),
        owner: parsed.owner,
        name: parsed.name,
        branch: branchValue,
      });
      const info = await gateway.getRepo();
      const finalBranch = branch.trim() || info.defaultBranch;

      settings.setRepo({ ...parsed, branch: finalBranch });
      settings.patch({
        content: {
          ...settings.content,
          rootDir: rootDir.trim() || 'src',
          excludes: excludes
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        },
      });
      await vault.setup({
        token: token.trim(),
        mode: unlockMode,
        ...(modeNeedsPassword(unlockMode) ? { password } : {}),
      });
      navigate('/', { replace: true });
    } catch (caught) {
      setError(mapError(caught).detail ?? mapError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="abs-shell flex min-h-screen items-center justify-center py-8">
      <div className="grid w-full max-w-[980px] gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="abs-sheet relative overflow-hidden p-5 sm:p-7">
          <span className="abs-tape" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-sakura">first run</p>
              <h1 className="mt-1 font-display text-[30px] font-bold leading-tight">把仓库接进来</h1>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                令牌只会在这台设备上加密保存。配置成功后，这个工作台会直接读写仓库里的 Markdown。
              </p>
            </div>
            <span className="abs-badge abs-badge-blush">01 樱糖手帐</span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field
              label="GitHub PAT"
              hint={<span className="font-mono">Fine-grained: Contents 读写 + Metadata 读</span>}
              className="sm:col-span-2"
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
            <Field label="仓库" hint={<span className="font-mono">owner/repository 或 GitHub URL</span>}>
              <input
                className="abs-input font-mono text-[11px]"
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                placeholder="God-2077/astro-blog-content-test"
                spellCheck={false}
              />
            </Field>
            <Field label="分支" hint={<span className="font-mono">留空使用仓库默认分支</span>}>
              <input
                className="abs-input font-mono text-[11px]"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="main"
              />
            </Field>
            <Field label="文章根目录">
              <input
                className="abs-input font-mono text-[11px]"
                value={rootDir}
                onChange={(event) => setRootDir(event.target.value)}
                placeholder="src"
              />
            </Field>
            <Field label="排除规则" hint={<span className="font-mono">一行一条；前缀或 glob</span>}>
              <textarea
                className="abs-textarea min-h-[86px] font-mono text-[10.5px]"
                value={excludes}
                onChange={(event) => setExcludes(event.target.value)}
              />
            </Field>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-line bg-paper-2 px-3.5 py-3">
            <p className="flex items-center gap-1.5 font-display text-[13px] font-bold">
              <ShieldCheck aria-hidden className="size-4 text-sakura" />
              解锁方式
            </p>
            <div className="mt-2">
              <UnlockModePicker value={unlockMode} onChange={setUnlockMode} hideLegend />
            </div>
            {modeNeedsPassword(unlockMode) ? (
              <Field label="密码" hint={`至少 ${MIN_VAULT_PASSWORD_LENGTH} 位；忘记只能重置保险库并重输 PAT`} className="mt-2">
                <input
                  className="abs-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="设置一个密码"
                  autoComplete="new-password"
                />
              </Field>
            ) : null}
          </div>

          {error ? (
            <p
              className="mt-3 rounded-lg border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2 text-[11px] text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" className="abs-btn abs-btn-primary" onClick={() => void handleSubmit()} disabled={busy}>
              {busy ? (
                <Spinner label="校验并加密…" />
              ) : (
                <>
                  连接仓库
                  <ArrowRight aria-hidden className="size-3.5" />
                </>
              )}
            </button>
            <Link to="/?demo=1" className="abs-btn abs-btn-ghost">
              <Sparkles aria-hidden className="size-3.5" />
              先看演示
            </Link>
            <a
              className="ml-auto font-mono text-[9px] text-muted underline decoration-line underline-offset-2 hover:text-sakura"
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer noopener"
            >
              创建 fine-grained token ↗
            </a>
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <div className="rounded-xl border border-line bg-paper px-4 py-3.5 text-[11px] leading-relaxed">
            <p className="flex items-center gap-1.5 font-display text-[13px] font-bold">
              <KeyRound aria-hidden className="size-3.5 text-sakura" />
              令牌怎么存
            </p>
            <p className="mt-1.5 text-muted">
              用设备指纹或密码经 PBKDF2 派生的密钥包装；双因子时密码与指纹会一起参与派生，两者缺一不可。令牌只以 AES-GCM
              密文存在 localStorage，解锁前不会进入网络请求。
            </p>
            <p className="mt-2 text-[10px] text-muted">
              设备指纹不是秘密；密码才是真正的安全边界。换设备或指纹变化后，双因子只能重置保险库。
            </p>
          </div>
          <div className="relative rotate-[0.6deg] rounded-[14px] border-[1.5px] border-edge bg-butter px-4 py-3.5 text-[10.5px] leading-relaxed shadow-sticker">
            <span className="abs-tape abs-tape-mint" aria-hidden />
            <p className="flex items-center gap-1.5 font-display text-[13px] font-bold">
              <Github aria-hidden className="size-3.5" />
              {APP_NAME}
            </p>
            <p className="mt-1.5">{APP_DESCRIPTION}</p>
            <a
              className="mt-2 inline-flex items-center gap-1 break-all font-mono text-[10px] text-ink-soft underline decoration-line underline-offset-2 hover:text-sakura"
              href={APP_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              {APP_URL_LABEL}
              <ArrowUpRight aria-hidden className="size-3 shrink-0" />
            </a>
          </div>
          <a
            className="group rounded-xl border border-line bg-paper px-4 py-3.5 text-[11px] leading-relaxed transition hover:border-sakura/40"
            href="https://blog.ksable.top/"
            target="_blank"
            rel="noreferrer noopener"
          >
            <p className="flex items-center gap-1.5 font-display text-[13px] font-bold">
              <NotebookPen aria-hidden className="size-3.5 text-sakura" />
              人家的博客喵
              <ArrowUpRight aria-hidden className="ml-auto size-3.5 text-muted transition group-hover:text-sakura" />
            </p>
            <p className="mt-1.5 text-muted">想先偷偷瞄一眼人家的博客嘛喵~ </p>
            <p className="mt-1.5 text-muted">快戳 blog.ksable.top 来玩玩呀 (｡･ω･｡)ﾉ♡</p>
          </a>
        </aside>
      </div>
    </div>
  );
}
