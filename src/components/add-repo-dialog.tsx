import * as Dialog from '@radix-ui/react-dialog';
import { GitBranch, KeyRound, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Field, Spinner } from '@/components/ui';
import type { AddRepoInput } from '@/hooks/use-repo-manager';

export interface AddRepoDefaults {
  rootDir: string;
  excludes: string;
}

export function AddRepoDialog({
  defaults,
  onClose,
  onSubmit,
}: {
  defaults: AddRepoDefaults;
  onClose: () => void;
  onSubmit: (input: AddRepoInput) => Promise<void>;
}) {
  const [repoInput, setRepoInput] = useState('');
  const [branch, setBranch] = useState('');
  const [token, setToken] = useState('');
  const [rootDir, setRootDir] = useState(defaults.rootDir || 'src');
  const [excludes, setExcludes] = useState(defaults.excludes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (busy) return;
    if (!repoInput.trim()) {
      setError('请先填写仓库。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ repoInput, branch, token, rootDir, excludes });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? null : onClose())} modal>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--abs-overlay)] backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-24px)] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">
                <GitBranch aria-hidden className="size-3.5" />
                add repository
              </p>
              <Dialog.Title className="font-display text-[22px] font-bold leading-tight">添加仓库</Dialog.Title>
              <Dialog.Description className="mt-1 text-[11px] leading-relaxed text-muted">
                每个仓库保存自己的 PAT，但共用同一个保险库与解锁方式。添加后会立即切换到这个仓库。
              </Dialog.Description>
            </div>
            <Dialog.Close className="abs-icon-btn" aria-label="关闭">
              <X aria-hidden className="size-3.5" />
            </Dialog.Close>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label="仓库"
              hint={<span className="font-mono">owner/repository 或 GitHub URL</span>}
              className="sm:col-span-2"
            >
              <input
                className="abs-input font-mono text-[11px]"
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                placeholder="God-2077/astro-blog-content"
                spellCheck={false}
              />
            </Field>
            <Field label="分支" hint={<span className="font-mono">留空使用仓库默认分支</span>}>
              <input
                className="abs-input font-mono text-[11px]"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="main"
                spellCheck={false}
              />
            </Field>
            <Field label="PAT" hint={<span className="font-mono">已有同仓库令牌时可留空</span>}>
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
            <Field label="根目录" hint={<span className="font-mono">相对仓库根</span>}>
              <input
                className="abs-input font-mono text-[11px]"
                value={rootDir}
                onChange={(event) => setRootDir(event.target.value)}
                placeholder="src"
              />
            </Field>
            <Field label="排除规则" hint={<span className="font-mono">一行一条；前缀或 glob</span>}>
              <textarea
                className="abs-textarea min-h-[84px] font-mono text-[10.5px]"
                value={excludes}
                onChange={(event) => setExcludes(event.target.value)}
              />
            </Field>
          </div>

          <p className="mt-3 rounded-lg border border-dashed border-line bg-paper-2 px-3 py-2 text-[10px] leading-relaxed text-muted">
            新仓库会先沿用当前仓库的扩展名、时区、索引并发、Frontmatter 字段与提交模板；这些配置之后按仓库独立保存。
          </p>

          {error ? (
            <p
              className="mt-3 rounded-lg border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2 text-[11px] text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Dialog.Close className="abs-btn abs-btn-ghost h-8 text-[11px]">取消</Dialog.Close>
            <button type="button" className="abs-btn h-8 text-[11px]" onClick={() => void submit()} disabled={busy}>
              {busy ? (
                <Spinner label="校验并添加…" />
              ) : (
                <>
                  <Plus aria-hidden className="size-3.5" />
                  校验并添加
                </>
              )}
            </button>
          </div>
          <p className="mt-3 flex items-center gap-1 font-mono text-[9px] text-muted">
            <KeyRound aria-hidden className="size-3" />
            PAT 只以密文写入本机保险库，不会出现在日志或 URL 里。
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
