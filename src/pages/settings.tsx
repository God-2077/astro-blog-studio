import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, LockKeyhole, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AddRepoDialog } from '@/components/add-repo-dialog';
import { Collapse } from '@/components/collapse';
import { confirmAction } from '@/components/confirm-toast';
import { FrontmatterFieldsEditor } from '@/components/frontmatter-fields-editor';
import { RepoTokenDialog } from '@/components/repo-token-dialog';
import { useResolvedTheme } from '@/components/theme-provider';
import { Field, Spinner } from '@/components/ui';
import { UnlockModePicker } from '@/components/unlock-mode-picker';
import { useContentActions } from '@/hooks/use-content-sync';
import { useRepoManager } from '@/hooks/use-repo-manager';
import { backupKeyPrefix } from '@/lib/backup/model';
import { clearBackupsByPrefix } from '@/lib/backup/store';
import { clampIndexConcurrency, INDEX_CONCURRENCY_MAX, INDEX_CONCURRENCY_MIN, type RepoProfile } from '@/lib/config/schema';
import {
  cloneFrontmatterFields,
  DEFAULT_FRONTMATTER_FIELDS,
  normalizeFrontmatterFields,
  validateFrontmatterFields,
} from '@/lib/frontmatter/fields';
import { useGateway } from '@/lib/gateway/context';
import { LOCALE_LABELS, LOCALES, normalizeLocale } from '@/lib/i18n';
import { useActiveLocale, useT } from '@/lib/i18n/react';
import { renderCommitMessage } from '@/lib/paths/commit-message';
import { repoProfileKey, repoTokenKey } from '@/lib/repos/identity';
import { allRepoProfiles } from '@/lib/repos/profile';
import { THEME_OPTIONS, type ThemePreference } from '@/lib/theme/theme';
import { cn } from '@/lib/utils/cn';
import { formatInTimeZone } from '@/lib/utils/date';
import { MIN_VAULT_PASSWORD_LENGTH, modeNeedsPassword, type VaultMode, vaultModeLabel } from '@/lib/vault/mode';
import { vaultSession } from '@/lib/vault/session';
import { useContent } from '@/stores/content';
import { useSettings } from '@/stores/settings';
import { useVault } from '@/stores/vault';

function parseExtensionsInput(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith('.') ? part : `.${part}`));
}

function parseExcludesInput(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** JSON with object keys sorted so dirty checks ignore serialization order. */
function stableSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
  });
}

/** Remount the whole form when the active repository changes. */
export function SettingsPage() {
  const mode = useGateway().mode;
  const activeRepo = useSettings((state) => state.repo);
  const sessionKey = `${mode}:${activeRepo ? repoProfileKey(activeRepo) : 'none'}`;
  return <SettingsSession key={sessionKey} />;
}

function SettingsSession() {
  const { mode, repo, config } = useGateway();
  const settings = useSettings();
  const vault = useVault();
  const content = useContent();
  const { checkNow, busy: cacheBusy } = useContentActions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useT();
  const activeLocale = useActiveLocale();

  const [rootDir, setRootDir] = useState(settings.content.rootDir);
  const [extensions, setExtensions] = useState(settings.content.extensions.join(', '));
  const [excludes, setExcludes] = useState(settings.content.excludes.join('\n'));
  const [timezone, setTimezone] = useState(settings.content.timezone);
  const [indexConcurrency, setIndexConcurrency] = useState(String(settings.content.indexConcurrency));
  const [createTemplate, setCreateTemplate] = useState(settings.commit.create);
  const [updateTemplate, setUpdateTemplate] = useState(settings.commit.update);
  const [deleteTemplate, setDeleteTemplate] = useState(settings.commit.delete);
  const [moveTemplate, setMoveTemplate] = useState(settings.commit.move);
  const [confirmBeforeCommit, setConfirmBeforeCommit] = useState(settings.commit.confirmBeforeCommit);
  const [updateUpdatedAt, setUpdateUpdatedAt] = useState(settings.editor.updateUpdatedAt);
  const [fontSize, setFontSize] = useState(String(settings.editor.fontSize));
  const [showLineNumbers, setShowLineNumbers] = useState(settings.editor.showLineNumbers);
  const [backupUnsaved, setBackupUnsaved] = useState(settings.editor.backupUnsaved);
  const [autoLockMinutes, setAutoLockMinutes] = useState(String(settings.security.autoLockMinutes));
  const [newPassword, setNewPassword] = useState('');
  const [unlockMode, setUnlockMode] = useState<VaultMode>(() => {
    const current = useVault.getState().mode;
    if (current === 'password' || current === 'two-factor') return current;
    if (current === 'legacy-mixed') return 'two-factor';
    return 'device';
  });
  const [fields, setFields] = useState(() => cloneFrontmatterFields(settings.frontmatter.fields));
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [clearingBackups, setClearingBackups] = useState(false);
  const [repoBusy, setRepoBusy] = useState(false);
  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const [tokenEditing, setTokenEditing] = useState<RepoProfile | null>(null);
  const { switchRepo, addRepo, updateToken, removeRepo } = useRepoManager();

  const isDemo = mode === 'demo';
  const repoProfiles = isDemo ? [] : allRepoProfiles(settings);
  const activeRepoKey = settings.repo ? repoProfileKey(settings.repo) : null;
  const resolvedTheme = useResolvedTheme();
  const samplePath = `${rootDir || 'src'}/content/blog/note/便笺-备忘单.md`;
  const sampleTitle = '便笺：备忘单';
  const today = new Date().toISOString().slice(0, 10);

  const storedSnapshot = stableSnapshot({
    rootDir: settings.content.rootDir.trim() || 'src',
    extensions: settings.content.extensions
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (part.startsWith('.') ? part : `.${part}`)),
    excludes: settings.content.excludes.map((line) => line.trim()).filter(Boolean),
    timezone: settings.content.timezone.trim() || 'Asia/Shanghai',
    indexConcurrency: settings.content.indexConcurrency,
    commit: settings.commit,
    editor: {
      updateUpdatedAt: settings.editor.updateUpdatedAt,
      fontSize: settings.editor.fontSize,
      showLineNumbers: settings.editor.showLineNumbers,
      backupUnsaved: settings.editor.backupUnsaved,
    },
    autoLockMinutes: settings.security.autoLockMinutes,
    fields: normalizeFrontmatterFields(settings.frontmatter.fields),
  });
  const localSnapshot = stableSnapshot({
    rootDir: rootDir.trim() || 'src',
    extensions: parseExtensionsInput(extensions),
    excludes: parseExcludesInput(excludes),
    timezone: timezone.trim() || 'Asia/Shanghai',
    indexConcurrency: clampIndexConcurrency(Number(indexConcurrency)),
    commit: { create: createTemplate, update: updateTemplate, delete: deleteTemplate, move: moveTemplate, confirmBeforeCommit },
    editor: {
      updateUpdatedAt,
      fontSize: Math.min(20, Math.max(12, Number(fontSize) || 15)),
      showLineNumbers,
      backupUnsaved,
    },
    autoLockMinutes: Math.min(240, Math.max(0, Number(autoLockMinutes) || 0)),
    fields: normalizeFrontmatterFields(fields),
  });
  const settingsDirty = storedSnapshot !== localSnapshot;

  const confirmDiscardSettings = async (message: string): Promise<boolean> => {
    if (!settingsDirty) return true;
    return confirmAction(message, {
      description: t('settings.confirm.discardDescription'),
      confirmLabel: t('settings.confirm.continueLabel'),
      cancelLabel: t('settings.confirm.keepEditing'),
      danger: true,
    });
  };

  const setThemePreference = (theme: ThemePreference): void => {
    settings.patch({ appearance: { ...settings.appearance, theme } });
  };

  const save = async (): Promise<void> => {
    const issues = validateFrontmatterFields(fields);
    if (issues.length) {
      setFieldError(issues.map((issue) => issue.message).join('；'));
      toast.error(t('settings.toast.fieldInvalid'));
      return;
    }
    setFieldError(null);
    const normalizedFields = normalizeFrontmatterFields(fields);
    setFields(normalizedFields);
    setBusy(true);
    try {
      settings.patch({
        content: {
          ...settings.content,
          rootDir: rootDir.trim() || 'src',
          extensions: parseExtensionsInput(extensions),
          excludes: parseExcludesInput(excludes),
          timezone: timezone.trim() || 'Asia/Shanghai',
          indexConcurrency: clampIndexConcurrency(Number(indexConcurrency)),
        },
        commit: {
          ...settings.commit,
          create: createTemplate,
          update: updateTemplate,
          delete: deleteTemplate,
          move: moveTemplate,
          confirmBeforeCommit,
        },
        editor: {
          ...settings.editor,
          updateUpdatedAt,
          fontSize: Math.min(20, Math.max(12, Number(fontSize) || 15)),
          showLineNumbers,
          backupUnsaved,
        },
        frontmatter: {
          fields: normalizedFields,
        },
        security: {
          ...settings.security,
          autoLockMinutes: Math.min(240, Math.max(0, Number(autoLockMinutes) || 0)),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['tree'] });
      toast.success(t('settings.toast.saved'));
    } finally {
      setBusy(false);
    }
  };

  const updateUnlock = async (): Promise<void> => {
    if (isDemo) return;
    if (modeNeedsPassword(unlockMode) && newPassword.length < MIN_VAULT_PASSWORD_LENGTH) {
      toast.error(t('errors.vault.passwordTooShort', { count: MIN_VAULT_PASSWORD_LENGTH }));
      return;
    }
    setPasswordBusy(true);
    try {
      await vault.changeUnlock({
        mode: unlockMode,
        ...(modeNeedsPassword(unlockMode) ? { password: newPassword } : {}),
      });
      setNewPassword('');
      toast.success(t('settings.toast.unlockUpdated', { mode: vaultModeLabel(unlockMode) }));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPasswordBusy(false);
    }
  };

  const lockNow = async (): Promise<void> => {
    await vault.lock();
    navigate('/unlock');
  };

  const clearLocalBackups = async (): Promise<void> => {
    if (clearingBackups) return;
    const confirmed = await confirmAction(t('settings.confirm.clearBackupsTitle'), {
      description: t('settings.confirm.clearBackupsDescription'),
      confirmLabel: t('settings.confirm.clearBackupsConfirm'),
      danger: true,
    });
    if (!confirmed) return;
    setClearingBackups(true);
    try {
      const ok = await clearBackupsByPrefix(backupKeyPrefix(mode, repo));
      if (ok) toast.success(t('settings.toast.clearBackupsDone'));
      else toast.error(t('settings.toast.clearBackupsFailed'));
    } finally {
      setClearingBackups(false);
    }
  };

  const cacheLastSynced = content.lastSyncedAt
    ? formatInTimeZone(new Date(content.lastSyncedAt), config.timezone)
    : t('settings.cache.neverSynced');
  const cachePhaseLabel =
    content.status === 'loading'
      ? content.mode === 'full'
        ? t('settings.cache.phaseReadingFull')
        : t('settings.cache.phaseReadingCache')
      : content.status === 'updating'
        ? t('settings.cache.phaseSyncing')
        : t('settings.cache.phaseChecking');
  const cachePercent =
    content.progress.total > 0 ? Math.min(100, Math.round((content.progress.done / content.progress.total) * 100)) : 0;

  const checkCache = async (): Promise<void> => {
    await checkNow({ notify: true });
  };

  const forceReloadCache = async (): Promise<void> => {
    if (isDemo) {
      toast.error(t('settings.toast.demoNoCache'));
      return;
    }
    const confirmed = await confirmAction(t('settings.confirm.forceFullTitle'), {
      description: t('settings.confirm.forceFullDescription'),
      confirmLabel: t('settings.confirm.forceFullConfirm'),
    });
    if (!confirmed) return;
    await checkNow({ forceFull: true, notify: true });
  };

  const openAddRepo = async (): Promise<void> => {
    if (repoBusy) return;
    if (!(await confirmDiscardSettings(t('settings.confirm.addRepoDiscard')))) return;
    setAddRepoOpen(true);
  };

  const handleSwitchRepo = async (profile: RepoProfile): Promise<void> => {
    if (repoBusy) return;
    if (!(await confirmDiscardSettings(t('settings.confirm.switchDiscard', { repo: `${profile.owner}/${profile.name}` })))) {
      return;
    }
    setRepoBusy(true);
    try {
      await switchRepo(repoProfileKey(profile));
      toast.success(t('settings.toast.switched', { repo: `${profile.owner}/${profile.name}` }));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRepoBusy(false);
    }
  };

  const handleAddRepo = async (input: Parameters<typeof addRepo>[0]): Promise<void> => {
    await addRepo(input);
    toast.success(t('settings.toast.addedAndSwitched'));
  };

  const handleUpdateToken = async (profile: RepoProfile, token: string): Promise<void> => {
    await updateToken(profile, token);
    toast.success(t('settings.toast.tokenUpdated', { repo: `${profile.owner}/${profile.name}` }));
  };

  const handleRemoveRepo = async (profile: RepoProfile): Promise<void> => {
    if (repoBusy) return;
    const confirmed = await confirmAction(
      t('settings.confirm.removeTitle', { repo: `${profile.owner}/${profile.name}@${profile.branch}` }),
      {
        description: t('settings.confirm.removeDescription'),
        confirmLabel: t('settings.confirm.removeConfirm'),
        danger: true,
      },
    );
    if (!confirmed) return;
    setRepoBusy(true);
    try {
      await removeRepo(profile);
      toast.success(t('settings.toast.removed'));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRepoBusy(false);
    }
  };

  const resetVault = async (): Promise<void> => {
    const confirmed = await confirmAction(t('settings.confirm.resetVaultTitle'), {
      description: t('settings.confirm.resetVaultDescription'),
      confirmLabel: t('settings.confirm.resetVaultConfirm'),
      danger: true,
    });
    if (!confirmed) return;
    await vault.reset();
    navigate('/setup');
  };

  const resetFields = async (): Promise<void> => {
    const confirmed = await confirmAction(t('settings.confirm.resetFieldsTitle'), {
      description: t('settings.confirm.resetFieldsDescription'),
      confirmLabel: t('settings.confirm.resetFieldsConfirm'),
    });
    if (!confirmed) return;
    setFields(cloneFrontmatterFields(DEFAULT_FRONTMATTER_FIELDS));
    setFieldError(null);
  };

  return (
    <div className="min-w-0 space-y-3">
      <header className="abs-paper flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="abs-icon-btn"
            onClick={() => navigate('/')}
            aria-label={t('settings.header.backToDashboard')}
          >
            <ArrowLeft aria-hidden className="size-3.5" />
          </button>
          <div>
            <h1 className="font-display text-[22px] font-bold leading-tight">{t('settings.header.title')}</h1>
            <p className="font-mono text-[9px] text-muted">
              {repo.owner}/{repo.name} · {repo.defaultBranch} · {isDemo ? t('settings.mode.demo') : t('settings.mode.live')}
            </p>
          </div>
        </div>
        <button type="button" className="abs-btn abs-btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? t('settings.header.saving') : t('settings.header.save')}
        </button>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="space-y-3">
          {!isDemo ? (
            <Collapse
              title={t('settings.repos.title')}
              tape="blush"
              meta={t('settings.repos.meta', { count: repoProfiles.length })}
            >
              <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-muted">{t('settings.repos.intro')}</p>
                <button
                  type="button"
                  className="abs-btn abs-btn-ghost h-7 shrink-0 px-2.5 text-[10px]"
                  onClick={() => void openAddRepo()}
                  disabled={repoBusy}
                >
                  <Plus aria-hidden className="size-3" />
                  {t('settings.repos.add')}
                </button>
              </div>

              <ul className="mt-2 space-y-2">
                {repoProfiles.map((profile) => {
                  const key = repoProfileKey(profile);
                  const isActive = key === activeRepoKey;
                  const tokenKey = repoTokenKey(profile);
                  const tokenReady = isActive
                    ? vaultSession.hasTokenForRepo(tokenKey)
                    : vaultSession.hasStoredTokenForRepo(tokenKey);
                  return (
                    <li key={key} className="rounded-xl border border-line bg-paper-2 px-3 py-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-all font-mono text-[11px] text-ink">
                            {profile.owner}/{profile.name}
                          </p>
                          <p className="mt-0.5 break-all font-mono text-[9px] text-muted">
                            {profile.branch} · {profile.content.rootDir}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {isActive ? <span className="abs-badge abs-badge-blush">{t('settings.repos.current')}</span> : null}
                          {!tokenReady ? (
                            <span className="font-mono text-[9px] text-danger">{t('settings.repos.missingPat')}</span>
                          ) : null}
                          {!isActive ? (
                            <button
                              type="button"
                              className="abs-btn abs-btn-ghost h-7 px-2.5 text-[10px]"
                              onClick={() => void handleSwitchRepo(profile)}
                              disabled={repoBusy || !tokenReady}
                              title={tokenReady ? undefined : t('settings.repos.tokenMissingHint')}
                            >
                              {t('settings.repos.switch')}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="abs-btn abs-btn-ghost h-7 px-2.5 text-[10px]"
                            onClick={() => setTokenEditing(profile)}
                            disabled={repoBusy}
                          >
                            {t('settings.repos.updateToken')}
                          </button>
                          {!isActive ? (
                            <button
                              type="button"
                              className="abs-btn abs-btn-ghost h-7 border-danger/40 px-2.5 text-[10px] text-danger"
                              onClick={() => void handleRemoveRepo(profile)}
                              disabled={repoBusy}
                            >
                              {t('settings.repos.remove')}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Collapse>
          ) : null}

          <Collapse title={t('settings.content.title')} tape="blush">
            {isDemo ? (
              <p className="mt-1 rounded-lg border border-dashed border-line bg-paper-2 px-3 py-2 text-[10.5px] leading-relaxed text-muted">
                {t('settings.content.demoNote')}
              </p>
            ) : null}
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field
                label={t('settings.content.rootDir')}
                hint={<span className="font-mono">{t('settings.content.rootDirHint')}</span>}
              >
                <input
                  className="abs-input font-mono text-[11px]"
                  value={rootDir}
                  onChange={(event) => setRootDir(event.target.value)}
                  disabled={isDemo}
                />
              </Field>
              <Field label={t('settings.content.extensions')} hint={t('settings.content.extensionsHint')}>
                <input
                  className="abs-input font-mono text-[11px]"
                  value={extensions}
                  onChange={(event) => setExtensions(event.target.value)}
                  disabled={isDemo}
                />
              </Field>
              <Field label={t('settings.content.timezone')} hint={t('settings.content.timezoneHint')}>
                <input
                  className="abs-input font-mono text-[11px]"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                />
              </Field>
              <Field label={t('settings.content.visible')} hint={t('settings.content.visibleHint')}>
                <input
                  className="abs-input font-mono text-[11px]"
                  value={isDemo ? t('settings.content.demoData') : t('settings.content.seeTree')}
                  disabled
                />
              </Field>
            </div>
            <Field
              label={t('settings.content.indexConcurrency')}
              hint={t('settings.content.indexConcurrencyHint', {
                min: INDEX_CONCURRENCY_MIN,
                max: INDEX_CONCURRENCY_MAX,
                default: 3,
              })}
              className="mt-3"
            >
              <input
                className="abs-input"
                type="number"
                min={INDEX_CONCURRENCY_MIN}
                max={INDEX_CONCURRENCY_MAX}
                value={indexConcurrency}
                onChange={(event) => setIndexConcurrency(event.target.value)}
              />
            </Field>
            <Field
              label={t('settings.content.excludes')}
              hint={<span className="font-mono">{t('settings.content.excludesHint')}</span>}
              className="mt-3"
            >
              <textarea
                className="abs-textarea min-h-[110px] font-mono text-[10.5px]"
                value={excludes}
                onChange={(event) => setExcludes(event.target.value)}
                disabled={isDemo}
              />
            </Field>
          </Collapse>

          <Collapse
            title={t('settings.cache.title')}
            tape="mint"
            meta={isDemo ? t('settings.cache.demoMeta') : t('settings.cache.meta', { count: content.cachedCount })}
          >
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">{t('settings.cache.intro')}</p>
            <div className="mt-2 grid gap-2 rounded-lg border border-dashed border-line bg-paper-2 px-3 py-2 font-mono text-[10px] text-muted sm:grid-cols-3">
              <span>{t('settings.cache.cached', { count: content.cachedCount })}</span>
              <span>{t('settings.cache.lastSynced', { value: cacheLastSynced })}</span>
              <span>{t('settings.cache.tree', { value: content.treeSha ? content.treeSha.slice(0, 8) : '—' })}</span>
            </div>
            {cacheBusy ? (
              <div className="mt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Spinner label={cachePhaseLabel} />
                  {content.progress.total > 0 ? (
                    <span className="font-mono text-[10px] text-muted">
                      {content.progress.done} / {content.progress.total}
                    </span>
                  ) : null}
                </div>
                {content.progress.total > 0 ? (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full border border-edge/20 bg-blush-2">
                    <span className="abs-progress" style={{ width: `${cachePercent}%` }} />
                  </div>
                ) : null}
              </div>
            ) : null}
            {content.persist === 'failed' ? (
              <p className="mt-2 text-[10px] leading-relaxed text-muted">{t('settings.cache.persistFailed')}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="abs-btn abs-btn-ghost text-[10.5px]"
                onClick={() => void checkCache()}
                disabled={cacheBusy || isDemo}
                aria-busy={cacheBusy}
              >
                <RefreshCw aria-hidden className={cn('size-3', cacheBusy && 'animate-spin')} />
                {cacheBusy ? t('settings.cache.checking') : t('settings.cache.checkUpdates')}
              </button>
              <button
                type="button"
                className="abs-btn abs-btn-ghost text-[10.5px]"
                onClick={() => void forceReloadCache()}
                disabled={cacheBusy || isDemo}
              >
                {t('settings.cache.forceFull')}
              </button>
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-muted">
              {isDemo ? t('settings.cache.demoFooter') : t('settings.cache.liveFooter')}
            </p>
          </Collapse>

          <Collapse
            title={t('settings.frontmatter.title')}
            tape="mint"
            meta={
              <>
                {t('settings.frontmatter.meta', { count: fields.length })}
                {fieldError ? <span className="ml-1 text-danger">{t('settings.frontmatter.invalid')}</span> : null}
              </>
            }
          >
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">{t('settings.frontmatter.intro')}</p>
            <FrontmatterFieldsEditor
              fields={fields}
              onChange={(next) => {
                setFields(next);
                setFieldError(null);
              }}
              onResetDefaults={resetFields}
            />
            {fieldError ? (
              <p
                className="mt-2 rounded-lg border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2 text-[11px] text-danger"
                role="alert"
              >
                {fieldError}
              </p>
            ) : null}
          </Collapse>

          <Collapse title={t('settings.commit.title')}>
            <p className="mt-0.5 text-[10.5px] text-muted">
              {t('settings.commit.hint', {
                placeholders: '{path} {title} {oldPath} {newPath} {dir} {name} {date} {action}',
              })}
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="create">
                <input
                  className="abs-input font-mono text-[11px]"
                  value={createTemplate}
                  onChange={(event) => setCreateTemplate(event.target.value)}
                />
              </Field>
              <Field label="update">
                <input
                  className="abs-input font-mono text-[11px]"
                  value={updateTemplate}
                  onChange={(event) => setUpdateTemplate(event.target.value)}
                />
              </Field>
              <Field label="delete">
                <input
                  className="abs-input font-mono text-[11px]"
                  value={deleteTemplate}
                  onChange={(event) => setDeleteTemplate(event.target.value)}
                />
              </Field>
              <Field label="move">
                <input
                  className="abs-input font-mono text-[11px]"
                  value={moveTemplate}
                  onChange={(event) => setMoveTemplate(event.target.value)}
                />
              </Field>
            </div>
            <p className="mt-2 break-all font-mono text-[9px] text-muted">
              preview:{' '}
              {renderCommitMessage(updateTemplate, { path: samplePath, action: 'update', date: today, title: sampleTitle })}
            </p>
            <label className="mt-3 flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                className="size-3.5 accent-[var(--abs-sakura)]"
                checked={confirmBeforeCommit}
                onChange={(event) => setConfirmBeforeCommit(event.target.checked)}
              />
              {t('settings.commit.confirmBefore')}
            </label>
          </Collapse>

          <Collapse title={t('settings.editor.title')}>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Field label={t('settings.editor.fontSize')}>
                <input
                  className="abs-input"
                  type="number"
                  min={12}
                  max={20}
                  value={fontSize}
                  onChange={(event) => setFontSize(event.target.value)}
                />
              </Field>
              <label className="mt-5 flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--abs-sakura)]"
                  checked={showLineNumbers}
                  onChange={(event) => setShowLineNumbers(event.target.checked)}
                />
                {t('settings.editor.showLineNumbers')}
              </label>
              <label className="mt-5 flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--abs-sakura)]"
                  checked={updateUpdatedAt}
                  onChange={(event) => setUpdateUpdatedAt(event.target.checked)}
                />
                {t('settings.editor.updateUpdatedAt')}
              </label>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">{t('settings.editor.previewHint')}</p>
            <div className="mt-3 border-t border-dashed border-line pt-3">
              <label className="flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--abs-sakura)]"
                  checked={backupUnsaved}
                  onChange={(event) => setBackupUnsaved(event.target.checked)}
                />
                {t('settings.editor.backupUnsaved')}
              </label>
              <p className="mt-1 text-[10px] leading-relaxed text-muted">{t('settings.editor.backupHint')}</p>
              <button
                type="button"
                className="abs-btn abs-btn-ghost mt-2 text-[10.5px]"
                onClick={() => void clearLocalBackups()}
                disabled={clearingBackups}
                aria-busy={clearingBackups}
              >
                {clearingBackups ? t('settings.editor.clearingBackups') : t('settings.editor.clearBackups')}
              </button>
            </div>
          </Collapse>

          <Collapse
            title={t('settings.appearance.title')}
            meta={t('settings.appearance.meta', {
              theme: resolvedTheme === 'night' ? t('common.theme.night.label') : t('common.theme.day.label'),
            })}
          >
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">{t('settings.appearance.intro')}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <span className="abs-label">{t('common.themeLabel')}</span>
              <fieldset className="abs-seg" aria-label={t('common.themeLabel')}>
                <legend className="sr-only">{t('common.themeLabel')}</legend>
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    title={t(option.hintKey)}
                    aria-pressed={settings.appearance.theme === option.value}
                    onClick={() => setThemePreference(option.value)}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </fieldset>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <span className="abs-label">{t('common.language')}</span>
              <select
                className="abs-input w-auto min-w-[160px]"
                aria-label={t('common.language')}
                value={activeLocale}
                onChange={(event) => {
                  const next = normalizeLocale(event.target.value);
                  if (!next) return;
                  useSettings.getState().patch({ appearance: { ...useSettings.getState().appearance, locale: next } });
                }}
              >
                {LOCALES.map((locale) => (
                  <option key={locale} value={locale}>
                    {LOCALE_LABELS[locale]}
                  </option>
                ))}
              </select>
            </div>
          </Collapse>
        </div>

        <aside className="space-y-3">
          <Collapse
            title={
              <>
                <KeyRound aria-hidden className="size-3.5 text-sakura" />
                {t('settings.security.title')}
              </>
            }
            meta={isDemo ? t('settings.mode.demo') : t('settings.security.encrypted')}
          >
            <p className="mt-1 break-all font-mono text-[9px] text-muted">
              {t('settings.security.tokens', {
                value: isDemo ? t('settings.security.demoNoToken') : t('settings.security.tokensEncrypted'),
              })}
            </p>
            {!isDemo ? (
              <p className="mt-1 text-[10px] leading-relaxed text-muted">
                {t('settings.security.currentMode')}
                <strong className="text-ink">{vaultModeLabel(vault.mode)}</strong>
              </p>
            ) : null}
            <Field label={t('settings.security.autoLock')} className="mt-2">
              <input
                className="abs-input"
                type="number"
                min={0}
                max={240}
                value={autoLockMinutes}
                onChange={(event) => setAutoLockMinutes(event.target.value)}
              />
            </Field>

            {!isDemo ? (
              <div className="mt-3 border-t border-dashed border-line pt-3">
                {vault.mode === 'legacy-mixed' ? (
                  <p className="mb-2 rounded-lg border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2 text-[10px] leading-relaxed text-danger">
                    {t('settings.security.legacyWarning')}
                  </p>
                ) : null}
                <UnlockModePicker value={unlockMode} onChange={setUnlockMode} />
                {modeNeedsPassword(unlockMode) ? (
                  <Field
                    label={t('settings.security.newPassword')}
                    hint={t('settings.security.newPasswordHint', { min: MIN_VAULT_PASSWORD_LENGTH })}
                    className="mt-2"
                  >
                    <input
                      className="abs-input"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder={t('settings.security.newPasswordPlaceholder')}
                      autoComplete="new-password"
                    />
                  </Field>
                ) : null}
                <button
                  type="button"
                  className="abs-btn mt-2 w-full text-[10.5px]"
                  onClick={() => void updateUnlock()}
                  disabled={passwordBusy}
                >
                  {passwordBusy ? t('settings.security.updating') : t('settings.security.updateUnlock')}
                </button>
                <p className="mt-1.5 text-[9px] leading-relaxed text-muted">{t('settings.security.updateNote')}</p>
              </div>
            ) : null}

            <div className="mt-3 flex flex-col gap-1.5">
              {!isDemo ? (
                <button type="button" className="abs-btn abs-btn-ghost text-[10.5px]" onClick={() => void lockNow()}>
                  <LockKeyhole aria-hidden className="size-3" />
                  {t('settings.security.lockNow')}
                </button>
              ) : null}
              {!isDemo ? (
                <button
                  type="button"
                  className="abs-btn abs-btn-ghost border-danger/40 text-[10.5px] text-danger"
                  onClick={() => void resetVault()}
                >
                  {t('settings.security.resetVault')}
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-muted">{t('settings.security.footer')}</p>
          </Collapse>

          <Collapse
            title={<span className="text-[16px] font-bold text-ink">{t('settings.config.title')}</span>}
            className="text-[10px] leading-relaxed text-muted"
          >
            <p className="mt-1 break-all font-mono">
              {repo.owner}/{repo.name}
              <br />
              {repo.defaultBranch} · {config.rootDir}
              <br />
              {t('settings.config.excludes', { count: config.excludes.length })}
            </p>
            <p className="mt-2 text-[9px]">{isDemo ? t('settings.config.demoNote') : t('settings.config.liveNote')}</p>
          </Collapse>
        </aside>
      </div>

      {addRepoOpen ? (
        <AddRepoDialog
          defaults={{ rootDir: settings.content.rootDir, excludes: settings.content.excludes.join('\n') }}
          onClose={() => setAddRepoOpen(false)}
          onSubmit={handleAddRepo}
        />
      ) : null}
      {tokenEditing ? (
        <RepoTokenDialog
          profile={tokenEditing}
          onClose={() => setTokenEditing(null)}
          onSubmit={(token) => handleUpdateToken(tokenEditing, token)}
        />
      ) : null}
    </div>
  );
}
