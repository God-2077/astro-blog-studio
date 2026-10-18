import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, LockKeyhole, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Field } from '@/components/ui';
import { useGateway } from '@/lib/gateway/context';
import { renderCommitMessage } from '@/lib/paths/commit-message';
import { rewrapVault } from '@/lib/vault/keystore';
import { vaultSession } from '@/lib/vault/session';
import { useSettings } from '@/stores/settings';
import { useVault } from '@/stores/vault';

export function SettingsPage() {
  const { mode, repo, config } = useGateway();
  const settings = useSettings();
  const vault = useVault();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [rootDir, setRootDir] = useState(settings.content.rootDir);
  const [extensions, setExtensions] = useState(settings.content.extensions.join(', '));
  const [excludes, setExcludes] = useState(settings.content.excludes.join('\n'));
  const [timezone, setTimezone] = useState(settings.content.timezone);
  const [createTemplate, setCreateTemplate] = useState(settings.commit.create);
  const [updateTemplate, setUpdateTemplate] = useState(settings.commit.update);
  const [deleteTemplate, setDeleteTemplate] = useState(settings.commit.delete);
  const [moveTemplate, setMoveTemplate] = useState(settings.commit.move);
  const [confirmBeforeCommit, setConfirmBeforeCommit] = useState(settings.commit.confirmBeforeCommit);
  const [updateUpdatedAt, setUpdateUpdatedAt] = useState(settings.editor.updateUpdatedAt);
  const [fontSize, setFontSize] = useState(String(settings.editor.fontSize));
  const [showLineNumbers, setShowLineNumbers] = useState(settings.editor.showLineNumbers);
  const [autoLockMinutes, setAutoLockMinutes] = useState(String(settings.security.autoLockMinutes));
  const [newPassword, setNewPassword] = useState('');
  const [requireDevice, setRequireDevice] = useState(settings.security.deviceBindingForPassword);
  const [busy, setBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const isDemo = mode === 'demo';
  const samplePath = `${rootDir || 'src'}/content/blog/note/便笺-备忘单.md`;
  const today = new Date().toISOString().slice(0, 10);

  const save = async (): Promise<void> => {
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
        },
        security: {
          ...settings.security,
          autoLockMinutes: Math.min(240, Math.max(0, Number(autoLockMinutes) || 0)),
          deviceBindingForPassword: requireDevice,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['tree'] });
      toast.success('设置已保存');
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (): Promise<void> => {
    if (isDemo) return;
    const token = vaultSession.get();
    if (!token) {
      toast.error('先解锁保险库再改密码');
      return;
    }
    if (newPassword && newPassword.length < 8) {
      toast.error('密码至少 8 位');
      return;
    }
    setPasswordBusy(true);
    try {
      await rewrapVault({
        token,
        password: newPassword || undefined,
        useDevice: true,
        requireDevice: requireDevice && Boolean(newPassword),
      });
      setNewPassword('');
      toast.success(newPassword ? '密码已更新' : '密码已移除，仅保留设备指纹');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPasswordBusy(false);
    }
  };

  const lockNow = (): void => {
    vault.lock();
    navigate('/unlock');
  };

  const resetVault = (): void => {
    if (!window.confirm('重置保险库会删除本机令牌，需要重新输入 PAT。继续吗？')) return;
    vault.reset();
    settings.setRepo(null);
    navigate('/setup');
  };

  const reconfigure = (): void => {
    if (!window.confirm('重新配置会删除本机保险库，然后回到首次配置。继续吗？')) return;
    vault.reset();
    navigate('/setup');
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
            <Field label="排除规则" hint={<span className="font-mono">一行一条；前缀或 glob</span>} className="mt-3">
              <textarea
                className="abs-textarea min-h-[110px] font-mono text-[10.5px]"
                value={excludes}
                onChange={(event) => setExcludes(event.target.value)}
                disabled={isDemo}
              />
            </Field>
          </section>

          <section className="abs-paper p-3.5">
            <h2 className="font-display text-[16px] font-bold">提交消息</h2>
            <p className="mt-0.5 text-[10.5px] text-muted">
              可用 {'{path} {oldPath} {newPath} {dir} {name} {date} {action}'}；未知占位符保持原文。
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
              preview: {renderCommitMessage(updateTemplate, { path: samplePath, action: 'update', date: today })}
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
          </section>
        </div>

        <aside className="space-y-3">
          <section className="abs-paper p-3.5">
            <h2 className="flex items-center gap-1.5 font-display text-[15px] font-bold">
              <KeyRound aria-hidden className="size-3.5 text-sakura" />
              安全
            </h2>
            <p className="mt-1 break-all font-mono text-[9px] text-muted">令牌：{isDemo ? '演示模式无令牌' : '已加密保存'}</p>
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
                <Field label="设置 / 更换密码" hint="留空并保存则移除密码，仅保留设备指纹">
                  <input
                    className="abs-input"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="新的密码（可留空）"
                    autoComplete="new-password"
                  />
                </Field>
                <label className="mt-2 flex items-center gap-2 text-[10.5px]">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[var(--abs-sakura)]"
                    checked={requireDevice}
                    onChange={(event) => setRequireDevice(event.target.checked)}
                  />
                  密码 + 设备双因子
                </label>
                <button
                  type="button"
                  className="abs-btn mt-2 w-full text-[10.5px]"
                  onClick={() => void changePassword()}
                  disabled={passwordBusy}
                >
                  {passwordBusy ? '更新中…' : '更新密码'}
                </button>
              </div>
            ) : null}

            <div className="mt-3 flex flex-col gap-1.5">
              {!isDemo ? (
                <button type="button" className="abs-btn abs-btn-ghost text-[10.5px]" onClick={lockNow}>
                  <LockKeyhole aria-hidden className="size-3" />
                  立即锁定
                </button>
              ) : null}
              <button type="button" className="abs-btn abs-btn-ghost text-[10.5px]" onClick={reconfigure}>
                <RotateCcw aria-hidden className="size-3" />
                重新配置仓库
              </button>
              <button
                type="button"
                className="abs-btn abs-btn-ghost border-danger/40 text-[10.5px] text-danger"
                onClick={resetVault}
              >
                重置保险库
              </button>
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-muted">
              忘记密码无法找回，只能重新输入 PAT。指纹变化时可用密码恢复。
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
            <p className="mt-2 text-[9px]">演示模式的数据只存在内存里。</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
