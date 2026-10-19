import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
        if (useEditorGuard.getState().dirty && !window.confirm('有未保存的修改；锁定前会先写入本机加密备份。继续锁定吗？')) {
          arm();
          return;
        }
        void (async () => {
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
