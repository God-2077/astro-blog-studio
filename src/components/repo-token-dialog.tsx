import * as Dialog from '@radix-ui/react-dialog';
import { KeyRound, X } from 'lucide-react';
import { useState } from 'react';
import { Field, Spinner } from '@/components/ui';
import type { RepoProfile } from '@/lib/config/schema';

export function RepoTokenDialog({
  profile,
  onClose,
  onSubmit,
}: {
  profile: RepoProfile;
  onClose: () => void;
  onSubmit: (token: string) => Promise<void>;
}) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (busy) return;
    const value = token.trim();
    if (!value) {
      setError('请输入新的 PAT。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
      setToken('');
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">
                <KeyRound aria-hidden className="size-3.5" />
                repository token
              </p>
              <Dialog.Title className="font-display text-[21px] font-bold leading-tight">更新仓库令牌</Dialog.Title>
              <Dialog.Description className="mt-1 break-all text-[11px] leading-relaxed text-muted">
                <span className="font-mono">
                  {profile.owner}/{profile.name}@{profile.branch}
                </span>
                <br />新 PAT 会加密保存到同一个保险库；同一仓库的其他分支也会使用它。
              </Dialog.Description>
            </div>
            <Dialog.Close className="abs-icon-btn" aria-label="关闭">
              <X aria-hidden className="size-3.5" />
            </Dialog.Close>
          </div>

          <Field label="新的 GitHub PAT" hint={<span className="font-mono">会先验证能否访问这个仓库</span>} className="mt-4">
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

          <div className="mt-4 flex items-center justify-end gap-2">
            <Dialog.Close className="abs-btn abs-btn-ghost h-8 text-[11px]">取消</Dialog.Close>
            <button type="button" className="abs-btn h-8 text-[11px]" onClick={() => void submit()} disabled={busy}>
              {busy ? <Spinner label="校验并保存…" /> : '校验并更新'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
