import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirmAction } from '@/components/confirm-toast';
import { useEditorGuard } from '@/stores/editor';
import { useSettings } from '@/stores/settings';
import { useVault } from '@/stores/vault';

/** Locks the live vault after N minutes without activity. Demo mode has no vault. */
export function useAutoLock(enabled: boolean): void {
  const minutes = useSettings((state) => state.security.autoLockMinutes);
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || minutes <= 0) return;
    let timer: number | undefined;

    const arm = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void (async () => {
          if (useEditorGuard.getState().dirty) {
            const lockAnyway = await confirmAction('有未保存的修改；锁定前会先写入本机加密备份。继续锁定吗？', {
              description: '选「继续编辑」会重新计时，当前修改不会丢。',
              confirmLabel: '继续锁定',
              cancelLabel: '继续编辑',
            });
            if (!lockAnyway) {
              arm();
              return;
            }
          }
          await useVault.getState().lock();
          navigate('/unlock');
        })();
      }, minutes * 60_000);
    };

    const onActivity = (): void => arm();
    arm();
    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll'];
    for (const event of events) window.addEventListener(event, onActivity, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, onActivity);
    };
  }, [enabled, minutes, navigate]);
}
