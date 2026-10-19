import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { FileWarning, History } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { BackupRecord } from '@/lib/backup/model';

interface BackupDialogProps {
  backup: BackupRecord;
  open: boolean;
  /** false on the lost-draft page, where there is no remote version to inspect. */
  allowDefer: boolean;
  remoteChanged: boolean;
  savedAtLabel: string;
  charCount: number;
  onRestore: () => void;
  onDiscard: () => void;
  onDefer: () => void;
}

/**
 * Reminds the user that a previous editing session left incomplete work on this
 * device. Restore is the primary action, but "later" must remain a real exit so
 * the user can inspect the remote file first; while deferred, autosave stays
 * paused and the editor keeps showing a banner.
 */
export function BackupDialog({
  backup,
  open,
  allowDefer,
  remoteChanged,
  savedAtLabel,
  charCount,
  onRestore,
  onDiscard,
  onDefer,
}: BackupDialogProps) {
  const actedRef = useRef(false);

  useEffect(() => {
    if (open) actedRef.current = false;
  }, [open]);

  const handleOpenChange = (next: boolean): void => {
    if (next) return;
    if (actedRef.current) {
      actedRef.current = false;
      return;
    }
    if (allowDefer) onDefer();
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-[var(--abs-overlay)] backdrop-blur-[2px]" />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop outline-none"
          onEscapeKeyDown={(event) => {
            if (!allowDefer) event.preventDefault();
          }}
        >
          <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sakura">
            <History aria-hidden className="size-3" />
            local backup
          </p>
          <AlertDialog.Title className="mt-1 font-display text-[20px] font-bold">发现未保存的备份</AlertDialog.Title>
          <AlertDialog.Description className="mt-1 text-[11px] leading-relaxed text-muted">
            {backup.isNew
              ? '上次新建这篇文章后还没有盖章，仓库里仍然没有这个文件。恢复后会回到本地起草状态。'
              : '上次离开这个文件时还有未保存的修改。恢复后仍是未保存状态，需要重新盖章才会提交。'}
          </AlertDialog.Description>

          <dl className="mt-3 grid grid-cols-[64px_minmax(0,1fr)] gap-x-2 gap-y-1 rounded-xl border border-dashed border-line bg-paper-2 px-3 py-2 font-mono text-[10px]">
            <dt className="text-muted">保存于</dt>
            <dd>{savedAtLabel}</dd>
            <dt className="text-muted">字数</dt>
            <dd>{charCount.toLocaleString('en-US')}</dd>
            <dt className="text-muted">路径</dt>
            <dd className="break-all">{backup.path}</dd>
          </dl>

          {remoteChanged ? (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-danger/30 bg-[var(--abs-danger-surface)] px-3 py-2 text-[10.5px] leading-relaxed text-danger">
              <FileWarning aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              远端在这之后已经变化；恢复后保存会先提示冲突，不会静默覆盖。
            </p>
          ) : null}

          <p className="mt-3 text-[10px] leading-relaxed text-muted">
            备份只保存在这台设备的浏览器里；真实仓库的备份已用保险库密钥加密，只能在解锁后读取。
          </p>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {allowDefer ? <AlertDialog.Cancel className="abs-btn abs-btn-ghost text-[11px]">稍后</AlertDialog.Cancel> : null}
            <button
              type="button"
              className="abs-btn abs-btn-ghost border-danger/40 text-[11px] text-danger"
              onClick={() => {
                actedRef.current = true;
                onDiscard();
              }}
            >
              丢弃备份
            </button>
            <AlertDialog.Action
              className="abs-btn text-[11px]"
              onClick={() => {
                actedRef.current = true;
                onRestore();
              }}
            >
              恢复备份
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
