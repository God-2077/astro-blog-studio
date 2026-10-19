import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, LockKeyhole, RefreshCw, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FrontmatterFieldsEditor } from '@/components/frontmatter-fields-editor';
import { useResolvedTheme } from '@/components/theme-provider';
import { Field } from '@/components/ui';
import { UnlockModePicker } from '@/components/unlock-mode-picker';
import { useContentActions } from '@/hooks/use-content-sync';
import { backupKeyPrefix } from '@/lib/backup/model';
import { clearBackupsByPrefix } from '@/lib/backup/store';
import { clampIndexConcurrency, INDEX_CONCURRENCY_MAX, INDEX_CONCURRENCY_MIN } from '@/lib/config/schema';
import {
  cloneFrontmatterFields,
  DEFAULT_FRONTMATTER_FIELDS,
  normalizeFrontmatterFields,
  validateFrontmatterFields,
} from '@/lib/frontmatter/fields';
import { useGateway } from '@/lib/gateway/context';
import { renderCommitMessage } from '@/lib/paths/commit-message';
import { THEME_OPTIONS, type ThemePreference } from '@/lib/theme/theme';
import { formatInTimeZone } from '@/lib/utils/date';
import { MIN_VAULT_PASSWORD_LENGTH, modeNeedsPassword, type VaultMode, vaultModeLabel } from '@/lib/vault/mode';
import { useContent } from '@/stores/content';
import { useSettings } from '@/stores/settings';
import { useVault } from '@/stores/vault';

export function SettingsPage() {
  const { mode, repo, config } = useGateway();
  const settings = useSettings();
  const vault = useVault();
  const content = useContent();
  const { checkNow, busy: cacheBusy } = useContentActions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  const isDemo = mode === 'demo';
  const resolvedTheme = useResolvedTheme();
  const samplePath = `${rootDir || 'src'}/content/blog/note/便笺-备忘单.md`;
  const sampleTitle = '便笺：备忘单';
  const today = new Date().toISOString().slice(0, 10);

  const setThemePreference = (theme: ThemePreference): void => {
    settings.patch({ appearance: { ...settings.appearance, theme } });
  };

  const save = async (): Promise<void> => {
    const issues = validateFrontmatterFields(fields);
    if (issues.length) {
      setFieldError(issues.map((issue) => issue.message).join('；'));
      toast.error('Frontmatter 字段有误，请先修正');
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
          extensions: extensions
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => (part.startsWith('.') ? part : `.${part}`)),
          excludes: excludes
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
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
      toast.success('设置已保存');
    } finally {
      setBusy(false);
    }
  };

  const updateUnlock = async (): Promise<void> => {
    if (isDemo) return;
    if (modeNeedsPassword(unlockMode) && newPassword.length < MIN_VAULT_PASSWORD_LENGTH) {
      toast.error(`密码至少 ${MIN_VAULT_PASSWORD_LENGTH} 位`);
      return;
    }
    setPasswordBusy(true);
    try {
      await vault.changeUnlock({
        mode: unlockMode,
        ...(modeNeedsPassword(unlockMode) ? { password: newPassword } : {}),
      });
      setNewPassword('');
      toast.success(`解锁方式已更新：${vaultModeLabel(unlockMode)}`);
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
    if (!window.confirm('清除本仓库在这台设备上的未保存备份？此操作不可恢复。')) return;
    const ok = await clearBackupsByPrefix(backupKeyPrefix(mode, repo));
    if (ok) toast.success('已清除本仓库的本机备份');
    else toast.error('清除失败，请稍后再试');
  };

  const cacheLastSynced = content.lastSyncedAt ? formatInTimeZone(new Date(content.lastSyncedAt), config.timezone) : '尚未同步';

  const checkCache = async (): Promise<void> => {
    await checkNow({ notify: true });
  };

  const forceReloadCache = async (): Promise<void> => {
    if (isDemo) {
      toast.error('演示模式不写本机缓存');
      return;
    }
    if (!window.confirm('强制全量更新会清除本仓库的本机文章缓存，并重新读取全部文章。继续吗？')) return;
    await checkNow({ forceFull: true, notify: true });
  };

  const resetVault = async (): Promise<void> => {
    if (
      !window.confirm(
        '重置保险库会删除本机令牌，以及本机所有真实仓库的未保存加密备份（演示备份保留），需要重新输入 PAT。继续吗？',
      )
    ) {
      return;
    }
    await vault.reset();
    settings.setRepo(null);
    navigate('/setup');
  };

  const reconfigure = async (): Promise<void> => {
    if (!window.confirm('重新配置会删除本机保险库与真实仓库的未保存备份，然后回到首次配置。继续吗？')) return;
    await vault.reset();
    navigate('/setup');
  };

  const resetFields = (): void => {
    if (!window.confirm('恢复 hello-world 常用字段？当前字段列表会被替换。')) return;
    setFields(cloneFrontmatterFields(DEFAULT_FRONTMATTER_FIELDS));
    setFieldError(null);
  };

  return (
    <div className="min-w-0 space-y-3">
      <header className="abs-paper flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2">
          <button type="button" className="abs-icon-btn" onClick={() => navigate('/')} aria-label="回到工作台">
            <ArrowLeft aria-hidden className="size-3.5" />
          </button>
          <div>
            <h1 className="font-display text-[22px] font-bold leading-tight">设置</h1>
            <p className="font-mono text-[9px] text-muted">
              {repo.owner}/{repo.name} · {repo.defaultBranch} · {isDemo ? '演示模式' : '真实仓库'}
            </p>
          </div>
        </div>
        <button type="button" className="abs-btn abs-btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? '保存中…' : '保存设置'}
        </button>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="space-y-3">
          <section className="abs-paper relative p-3.5">
            <span className="abs-tape" aria-hidden />
            <h2 className="font-display text-[16px] font-bold">内容与排除</h2>
            {isDemo ? (
              <p className="mt-1 rounded-lg border border-dashed border-line bg-paper-2 px-3 py-2 text-[10.5px] leading-relaxed text-muted">
                演示模式使用固定的示例仓库与排除规则；这些字段在连接真实仓库后生效。
              </p>
            ) : null}
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="根目录" hint={<span className="font-mono">相对仓库根</span>}>
                <input
                  className="abs-input font-mono text-[11px]"
                  value={rootDir}
                  onChange={(event) => setRootDir(event.target.value)}
                  disabled={isDemo}
                />
              </Field>
              <Field label="文件扩展名" hint="逗号分隔">
                <input
                  className="abs-input font-mono text-[11px]"
                  value={extensions}
                  onChange={(event) => setExtensions(event.target.value)}
                  disabled={isDemo}
                />
              </Field>
              <Field label="时区" hint="用于 date 模板与 updated">
                <input
                  className="abs-input font-mono text-[11px]"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                />
              </Field>
              <Field label="当前可见" hint="来自文件树">
                <input className="abs-input font-mono text-[11px]" value={isDemo ? '示例数据' : '见文件树'} disabled />
              </Field>
            </div>
            <Field
              label="索引并发"
              hint={`${INDEX_CONCURRENCY_MIN}–${INDEX_CONCURRENCY_MAX}，默认 3。首次全量读取与增量同步时同时进行的 20 篇批次数；调高更快，过高可能触发 GitHub 限流。`}
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
            <Field label="排除规则" hint={<span className="font-mono">一行一条；前缀或 glob</span>} className="mt-3">
              <textarea
                className="abs-textarea min-h-[110px] font-mono text-[10.5px]"
                value={excludes}
                onChange={(event) => setExcludes(event.target.value)}
                disabled={isDemo}
              />
            </Field>
          </section>

          <section className="abs-paper relative p-3.5">
            <span className="abs-tape abs-tape-mint" aria-hidden />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-[16px] font-bold">本机文章缓存</h2>
              <span className="font-mono text-[9px] text-muted">
                {isDemo ? '演示模式 · 仅内存' : `${content.cachedCount} 篇 · AES-GCM`}
              </span>
            </div>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
              首次打开会把全库文章读一遍并加密保存在本机 IndexedDB；之后每次只拉取文件树，按路径与 blob sha
              比对，只重新读取新增或修改的文章，并从缓存里删除已删除的文章。
            </p>
            <div className="mt-2 grid gap-2 rounded-lg border border-dashed border-line bg-paper-2 px-3 py-2 font-mono text-[10px] text-muted sm:grid-cols-3">
              <span>已缓存 {content.cachedCount} 篇</span>
              <span>上次同步 {cacheLastSynced}</span>
              <span>树 {content.treeSha ? content.treeSha.slice(0, 8) : '—'}</span>
            </div>
            {cacheBusy ? (
              <p className="mt-2 font-mono text-[10px] text-muted">
                正在同步 {content.progress.done} / {content.progress.total || content.indexed}
              </p>
            ) : null}
            {content.persist === 'failed' ? (
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                本机缓存写入失败（可能是空间不足）；本次会话仍可浏览，重新打开网站会重新读取。
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="abs-btn abs-btn-ghost text-[10.5px]"
                onClick={() => void checkCache()}
                disabled={cacheBusy || isDemo}
              >
                <RefreshCw aria-hidden className="size-3" />
                检查更新
              </button>
              <button
                type="button"
                className="abs-btn abs-btn-ghost text-[10.5px]"
                onClick={() => void forceReloadCache()}
                disabled={cacheBusy || isDemo}
              >
                强制全量更新
              </button>
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-muted">
              {isDemo
                ? '演示仓库只存在内存里，演示模式不写本机缓存。'
                : '真实仓库用保险库数据密钥派生的子密钥加密；锁定后无法读取，重置保险库会一并清除。'}
            </p>
          </section>

          <section className="abs-paper relative p-3.5">
            <span className="abs-tape abs-tape-mint" aria-hidden />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-[16px] font-bold">Frontmatter 字段</h2>
              <span className="font-mono text-[9px] text-muted">{fields.length} 个字段</span>
            </div>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
              决定编辑器的字段、类型和必填校验；删除字段不会删除已有文件里的键，未配置字段会原样保留。
            </p>
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
          </section>

          <section className="abs-paper p-3.5">
            <h2 className="font-display text-[16px] font-bold">提交消息</h2>
            <p className="mt-0.5 text-[10.5px] text-muted">
              可用 {'{path} {title} {oldPath} {newPath} {dir} {name} {date} {action}'}；未知占位符保持原文。
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
              保存前弹提交确认
            </label>
          </section>

          <section className="abs-paper p-3.5">
            <h2 className="font-display text-[16px] font-bold">编辑与预览</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Field label="正文字号">
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
                显示行号
              </label>
              <label className="mt-5 flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--abs-sakura)]"
                  checked={updateUpdatedAt}
                  onChange={(event) => setUpdateUpdatedAt(event.target.checked)}
                />
                保存时更新 updated
              </label>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              预览支持 GFM、代码、数学、剧透、ruby 与 ::: 容器；原始 HTML 会被净化，链接卡片降级为普通链接。
            </p>
            <div className="mt-3 border-t border-dashed border-line pt-3">
              <label className="flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--abs-sakura)]"
                  checked={backupUnsaved}
                  onChange={(event) => setBackupUnsaved(event.target.checked)}
                />
                备份未保存的修改
              </label>
              <p className="mt-1 text-[10px] leading-relaxed text-muted">
                真实仓库的备份用保险库密钥加密后写在本机
                IndexedDB，只能在解锁后恢复；演示模式不加密。进入编辑器时会检查并提示恢复。
              </p>
              <button
                type="button"
                className="abs-btn abs-btn-ghost mt-2 text-[10.5px]"
                onClick={() => void clearLocalBackups()}
              >
                清除本仓库的本机备份
              </button>
            </div>
          </section>
          <section className="abs-paper p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-[16px] font-bold">外观</h2>
              <span className="font-mono text-[9px] text-muted">即时生效 · 当前{resolvedTheme === 'night' ? '夜' : '昼'}</span>
            </div>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
              默认跟随系统；手动选择后会记住。夜间使用暖墨纸与米白墨，不是把浅色主题反相。
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <span className="abs-label">主题</span>
              <fieldset className="abs-seg" aria-label="主题">
                <legend className="sr-only">主题</legend>
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    title={option.hint}
                    aria-pressed={settings.appearance.theme === option.value}
                    onClick={() => setThemePreference(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </fieldset>
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <section className="abs-paper p-3.5">
            <h2 className="flex items-center gap-1.5 font-display text-[15px] font-bold">
              <KeyRound aria-hidden className="size-3.5 text-sakura" />
              安全
            </h2>
            <p className="mt-1 break-all font-mono text-[9px] text-muted">令牌：{isDemo ? '演示模式无令牌' : '已加密保存'}</p>
            {!isDemo ? (
              <p className="mt-1 text-[10px] leading-relaxed text-muted">
                当前解锁方式：<strong className="text-ink">{vaultModeLabel(vault.mode)}</strong>
              </p>
            ) : null}
            <Field label="自动锁定（分钟，0 关闭）" className="mt-2">
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
                    这是旧版「密码或指纹」模式。选择一种方式并更新后，会改为严格双因子或单一方式；设备包装会被移除。
                  </p>
                ) : null}
                <UnlockModePicker value={unlockMode} onChange={setUnlockMode} />
                {modeNeedsPassword(unlockMode) ? (
                  <Field label="新密码" hint={`至少 ${MIN_VAULT_PASSWORD_LENGTH} 位；不要求旧密码`} className="mt-2">
                    <input
                      className="abs-input"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="输入新密码"
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
                  {passwordBusy ? '更新中…' : '更新解锁方式'}
                </button>
                <p className="mt-1.5 text-[9px] leading-relaxed text-muted">
                  立即生效，存在本机保险库里；已加密的未保存备份不会失效。
                </p>
              </div>
            ) : null}

            <div className="mt-3 flex flex-col gap-1.5">
              {!isDemo ? (
                <button type="button" className="abs-btn abs-btn-ghost text-[10.5px]" onClick={() => void lockNow()}>
                  <LockKeyhole aria-hidden className="size-3" />
                  立即锁定
                </button>
              ) : null}
              {!isDemo ? (
                <button type="button" className="abs-btn abs-btn-ghost text-[10.5px]" onClick={() => void reconfigure()}>
                  <RotateCcw aria-hidden className="size-3" />
                  重新配置仓库
                </button>
              ) : null}
              {!isDemo ? (
                <button
                  type="button"
                  className="abs-btn abs-btn-ghost border-danger/40 text-[10.5px] text-danger"
                  onClick={() => void resetVault()}
                >
                  重置保险库
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-muted">
              双因子下忘记密码或指纹变化都无法找回，只能重置保险库并重新输入 PAT；本机真实仓库的未保存备份会一起清除。
            </p>
          </section>

          <section className="rounded-xl border border-line bg-paper px-3.5 py-3 text-[10px] leading-relaxed text-muted">
            <p className="font-display text-[12px] font-bold text-ink">当前配置</p>
            <p className="mt-1 break-all font-mono">
              {repo.owner}/{repo.name}
              <br />
              {repo.defaultBranch} · {config.rootDir}
              <br />
              {config.excludes.length} 条排除
            </p>
            <p className="mt-2 text-[9px]">
              {isDemo
                ? '演示模式的仓库内容只在内存里；未保存备份保存在本机演示键（不加密）。'
                : '备份加密后只写本机 IndexedDB，不会上传。'}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
