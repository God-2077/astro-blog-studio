import { ArrowRight, Fingerprint, KeyRound, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Field, Spinner } from '@/components/ui';
import { SUGGESTED_EXCLUDES } from '@/lib/config/defaults';
import { mapError } from '@/lib/github/errors';
import { LiveGateway } from '@/lib/github/live';
import { parseRepoInput } from '@/lib/github/repo-input';
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
  const [usePassword, setUsePassword] = useState(false);
  const [useDevice, setUseDevice] = useState(true);
  const [requireDevice, setRequireDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (vault.status === 'unlocked' && settings.repo) navigate('/', { replace: true });
  }, [vault.status, settings.repo, navigate]);

  if (vault.status === 'unlocked' && settings.repo) return <Navigate to="/" replace />;

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    const parsed = parseRepoInput(repoInput);
    if (!token.trim()) return setError('请先粘贴 GitHub PAT。');
    if (!parsed) return setError('仓库格式应为 owner/repository，或完整的 GitHub URL。');
    if (!useDevice && !usePassword) return setError('至少选择一种解锁方式：设备指纹或密码。');
    if (usePassword && password.length < 8) return setError('密码至少 8 位。');
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
        password: usePassword ? password : undefined,
        useDevice,
        requireDevice: useDevice ? requireDevice : false,
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
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[11px]">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 accent-[var(--abs-sakura)]"
                  checked={useDevice}
                  onChange={(event) => setUseDevice(event.target.checked)}
                />
                <span>
                  <strong className="block">设备指纹自动解锁</strong>
                  <span className="text-muted">FingerprintJS；刷新后自动打开。</span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[11px]">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 accent-[var(--abs-sakura)]"
                  checked={usePassword}
                  onChange={(event) => setUsePassword(event.target.checked)}
                />
                <span>
                  <strong className="block">同时设置密码</strong>
                  <span className="text-muted">每次新标签页都要验证。</span>
                </span>
              </label>
            </div>
            {usePassword || !useDevice ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Field label="密码" hint="至少 8 位；忘记只能重输 PAT">
                  <input
                    className="abs-input"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="设置一个密码"
                    autoComplete="new-password"
                  />
                </Field>
                <label className="mt-4 flex items-center gap-1.5 text-[11px]">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[var(--abs-sakura)]"
                    checked={requireDevice}
                    onChange={(event) => setRequireDevice(event.target.checked)}
                  />
                  密码 + 设备双因子
                </label>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="mt-3 rounded-lg border border-danger/30 bg-white/70 px-3 py-2 text-[11px] text-danger" role="alert">
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
              用设备指纹（或你设置的密码）经 PBKDF2 派生的密钥包装；令牌只以 AES-GCM 密文存在
              localStorage，解锁前不会进入网络请求。
            </p>
            <p className="mt-2 text-[10px] text-muted">设备指纹不是秘密；密码才是真正的安全边界。</p>
          </div>
          <div className="relative rotate-[0.6deg] rounded-[14px] border-[1.5px] border-ink bg-butter px-4 py-3.5 text-[10.5px] leading-relaxed shadow-sticker">
            <span className="abs-tape abs-tape-mint" aria-hidden />
            <p className="flex items-center gap-1.5 font-display text-[13px] font-bold">
              <Fingerprint aria-hidden className="size-3.5" />
              测试仓库
            </p>
            <p className="mt-1.5">
              <code className="font-mono">God-2077/astro-blog-content-test</code> 当前是空仓库；先在 studio
              目录跑一次种子脚本，或在应用里用演示模式先看界面。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
