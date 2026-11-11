import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, Github, KeyRound, NotebookPen, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Field, Spinner } from '@/components/ui';
import { UnlockModePicker } from '@/components/unlock-mode-picker';
import { APP_NAME, APP_URL, APP_URL_LABEL, APP_VERSION } from '@/lib/config/app-meta';
import { SUGGESTED_EXCLUDES } from '@/lib/config/defaults';
import { ConfigImportError, parseConfigImport } from '@/lib/config/import';
import { mapError } from '@/lib/github/errors';
import { LiveGateway } from '@/lib/github/live';
import { parseRepoInput } from '@/lib/github/repo-input';
import { LOCALE_LABELS, LOCALES, normalizeLocale } from '@/lib/i18n';
import { useActiveLocale, useT } from '@/lib/i18n/react';
import { unlockReturnState } from '@/lib/navigation/unlock-return';
import { repoTokenKey } from '@/lib/repos/identity';
import { profileFromSettings } from '@/lib/repos/profile';
import { MIN_VAULT_PASSWORD_LENGTH, modeNeedsPassword, type VaultMode } from '@/lib/vault/mode';
import { useContent } from '@/stores/content';
import { useDrafts } from '@/stores/drafts';
import { useLastCommit } from '@/stores/last-commit';
import { useRateLimit } from '@/stores/rate-limit';
import { useSettings } from '@/stores/settings';
import { useVault } from '@/stores/vault';

export function SetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useSettings();
  const vault = useVault();
  const t = useT();
  const activeLocale = useActiveLocale();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState('');
  const [repoInput, setRepoInput] = useState('');
  const [branch, setBranch] = useState('');
  const [rootDir, setRootDir] = useState(settings.content.rootDir || 'src');
  const [excludes, setExcludes] = useState(
    settings.content.excludes.length > 0 ? settings.content.excludes.join('\n') : SUGGESTED_EXCLUDES.join('\n'),
  );
  const [password, setPassword] = useState('');
  const [unlockMode, setUnlockMode] = useState<VaultMode>('device');
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (vault.status === 'unlocked' && settings.repo) navigate('/', { replace: true });
  }, [vault.status, settings.repo, navigate]);

  if (vault.status === 'locked') return <Navigate to="/unlock" replace state={unlockReturnState(location)} />;
  if (vault.status === 'unlocked' && settings.repo) return <Navigate to="/" replace />;

  const handleImportFile = async (file: File): Promise<void> => {
    setError(null);
    setImportBusy(true);
    try {
      const parsed = parseConfigImport(await file.text());
      if (modeNeedsPassword(unlockMode) && password.length < MIN_VAULT_PASSWORD_LENGTH) {
        setError(t('setup.error.passwordTooShort', { count: MIN_VAULT_PASSWORD_LENGTH }));
        return;
      }
      await vault.setupFromImport({
        tokens: parsed.tokens,
        mode: unlockMode,
        ...(modeNeedsPassword(unlockMode) ? { password } : {}),
      });
      useSettings.getState().replaceFromImport(parsed.settings);
      useContent.getState().reset();
      useDrafts.getState().reset();
      useLastCommit.getState().clear();
      useRateLimit.getState().reset();
      queryClient.clear();
      toast.success(t('settings.toast.imported'));
      navigate('/', { replace: true });
    } catch (caught) {
      if (caught instanceof ConfigImportError) {
        if (caught.code === 'MISSING_PAT') {
          setError(t('settings.transfer.missingPat', { repos: caught.missing.join(', ') }));
        } else if (caught.code === 'DEMO_SOURCE') {
          setError(t('settings.transfer.demoSource'));
        } else {
          setError(t('settings.transfer.invalidFile'));
        }
      } else {
        setError(caught instanceof Error ? caught.message : t('settings.transfer.failed'));
      }
    } finally {
      setImportBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    const parsed = parseRepoInput(repoInput);
    if (!token.trim()) return setError(t('setup.error.tokenRequired'));
    if (!parsed) return setError(t('setup.error.repoInvalid'));
    if (modeNeedsPassword(unlockMode) && password.length < MIN_VAULT_PASSWORD_LENGTH) {
      return setError(t('setup.error.passwordTooShort', { count: MIN_VAULT_PASSWORD_LENGTH }));
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
      const repo = { ...parsed, branch: finalBranch };
      const content = {
        rootDir: rootDir.trim() || 'src',
        excludes: excludes
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      };

      await vault.setup({
        repoKey: repoTokenKey(repo),
        token: token.trim(),
        mode: unlockMode,
        ...(modeNeedsPassword(unlockMode) ? { password } : {}),
      });
      settings.startWorkspace(profileFromSettings(useSettings.getState(), repo, content));
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
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-sakura">{t('setup.eyebrow')}</p>
              <h1 className="mt-1 font-display text-[30px] font-bold leading-tight">{t('setup.title')}</h1>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{t('setup.intro')}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <select
                className="abs-input w-auto"
                aria-label={t('common.language')}
                value={activeLocale}
                onChange={(event) => {
                  const next = normalizeLocale(event.target.value);
                  if (!next) return;
                  useSettings.getState().patch({
                    appearance: { ...useSettings.getState().appearance, locale: next },
                  });
                }}
              >
                {LOCALES.map((locale) => (
                  <option key={locale} value={locale}>
                    {LOCALE_LABELS[locale]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field
              label={t('setup.pat.label')}
              hint={<span className="font-mono">{t('setup.pat.hint')}</span>}
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
            <Field label={t('setup.repo.label')} hint={<span className="font-mono">{t('setup.repo.hint')}</span>}>
              <input
                className="abs-input font-mono text-[11px]"
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                placeholder="God-2077/astro-blog-content-test"
                spellCheck={false}
              />
            </Field>
            <Field label={t('setup.branch.label')} hint={<span className="font-mono">{t('setup.branch.hint')}</span>}>
              <input
                className="abs-input font-mono text-[11px]"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="main"
              />
            </Field>
            <Field label={t('setup.rootDir.label')}>
              <input
                className="abs-input font-mono text-[11px]"
                value={rootDir}
                onChange={(event) => setRootDir(event.target.value)}
                placeholder="src"
              />
            </Field>
            <Field label={t('setup.excludes.label')} hint={<span className="font-mono">{t('setup.excludes.hint')}</span>}>
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
              {t('setup.unlockMode.title')}
            </p>
            <div className="mt-2">
              <UnlockModePicker value={unlockMode} onChange={setUnlockMode} hideLegend />
            </div>
            {modeNeedsPassword(unlockMode) ? (
              <Field
                label={t('setup.unlockMode.password.label')}
                hint={t('setup.unlockMode.password.hint', { count: MIN_VAULT_PASSWORD_LENGTH })}
                className="mt-2"
              >
                <input
                  className="abs-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('setup.unlockMode.password.placeholder')}
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
                <Spinner label={t('setup.submit.busy')} />
              ) : (
                <>
                  {t('setup.submit.idle')}
                  <ArrowRight aria-hidden className="size-3.5" />
                </>
              )}
            </button>
            {vault.status === 'empty' ? (
              <>
                <button
                  type="button"
                  className="abs-btn abs-btn-ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy || importBusy}
                  aria-busy={importBusy}
                >
                  {importBusy ? (
                    <Spinner label={t('settings.transfer.importing')} />
                  ) : (
                    <>
                      <Upload aria-hidden className="size-3.5" />
                      {t('settings.transfer.importButton')}
                    </>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleImportFile(file);
                  }}
                />
              </>
            ) : null}
            <Link to="/?demo=1" className="abs-btn abs-btn-ghost">
              <Sparkles aria-hidden className="size-3.5" />
              {t('setup.demo')}
            </Link>
            <a
              className="ml-auto font-mono text-[9px] text-muted underline decoration-line underline-offset-2 hover:text-sakura"
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer noopener"
            >
              {t('setup.createToken')}
            </a>
          </div>
          <span className="pointer-events-none absolute right-3 bottom-2 font-mono text-[9px] leading-none text-muted sm:right-4 sm:bottom-3">
            v{APP_VERSION}
          </span>
        </div>

        <aside className="flex flex-col gap-3">
          <div className="rounded-xl border border-line bg-paper px-4 py-3.5 text-[11px] leading-relaxed">
            <p className="flex items-center gap-1.5 font-display text-[13px] font-bold">
              <KeyRound aria-hidden className="size-3.5 text-sakura" />
              {t('setup.storage.title')}
            </p>
            <p className="mt-1.5 text-muted">{t('setup.storage.body')}</p>
            <p className="mt-2 text-[10px] text-muted">{t('setup.storage.note')}</p>
          </div>
          <div className="relative rotate-[0.6deg] rounded-[14px] border-[1.5px] border-edge bg-butter px-4 py-3.5 text-[10.5px] leading-relaxed shadow-sticker">
            <span className="abs-tape abs-tape-mint" aria-hidden />
            <p className="flex items-center gap-1.5 font-display text-[13px] font-bold">
              <Github aria-hidden className="size-3.5" />
              {APP_NAME}
            </p>
            <p className="mt-1.5">{t('common.appDescription')}</p>
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
              {t('setup.blog.title')}
              <ArrowUpRight aria-hidden className="ml-auto size-3.5 text-muted transition group-hover:text-sakura" />
            </p>
            <p className="mt-1.5 text-muted">{t('setup.blog.intro')}</p>
            <p className="mt-1.5 text-muted">{t('setup.blog.hint')}</p>
          </a>
        </aside>
      </div>
    </div>
  );
}
