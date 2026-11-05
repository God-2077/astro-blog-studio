import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useState } from 'react';
import { useT } from '@/lib/i18n/react';
import { useEditorGuard } from '@/stores/editor';
import { usePwaUpdate } from '@/stores/pwa';

/** 1.5s 内页面没被 reload（Service Worker 激活异常）就自己刷新一次，避免弹窗卡死。 */
const RELOAD_FALLBACK_MS = 1_500;

/**
 * 检测到新部署时的弹窗：只提醒，不自动刷新。
 * 刷新会丢掉内存里的编辑，所以「稍后」必须是一个真实可用的出口。
 */
export function PwaUpdateDialog() {
  const t = useT();
  const needRefresh = usePwaUpdate((state) => state.needRefresh);
  const dismissed = usePwaUpdate((state) => state.dismissed);
  const applyUpdate = usePwaUpdate((state) => state.applyUpdate);
  const dismissPrompt = usePwaUpdate((state) => state.dismissPrompt);
  const dirty = useEditorGuard((state) => state.dirty);
  const [applying, setApplying] = useState(false);

  const handleRefresh = (): void => {
    if (applying) return;
    setApplying(true);
    applyUpdate();
    window.setTimeout(() => {
      // 重新启用按钮，然后整页导航；如果编辑器有未保存的修改，现有 beforeunload 仍会拦一次。
      setApplying(false);
      window.location.reload();
    }, RELOAD_FALLBACK_MS);
  };

  return (
    <AlertDialog.Root
      open={needRefresh && !dismissed}
      onOpenChange={(next) => {
        if (!next) dismissPrompt();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-[var(--abs-overlay)] backdrop-blur-[2px]" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-[1.5px] border-edge bg-paper p-5 shadow-pop">
          <AlertDialog.Title className="font-display text-[20px] font-bold">{t('pwa.title')}</AlertDialog.Title>
          <AlertDialog.Description className="mt-1 text-[11px] leading-relaxed text-muted">
            {t('pwa.description')}
          </AlertDialog.Description>
          {dirty ? <p className="mt-3 text-[11px] leading-relaxed text-danger">{t('pwa.dirty')}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Cancel className="abs-btn abs-btn-ghost text-[11px]">{t('pwa.later')}</AlertDialog.Cancel>
            <button type="button" className="abs-btn text-[11px]" onClick={handleRefresh} disabled={applying}>
              {applying ? t('pwa.refreshing') : t('pwa.refreshNow')}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
