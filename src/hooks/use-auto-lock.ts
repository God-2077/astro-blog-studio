import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirmAction } from '@/components/confirm-toast';
import { useT } from '@/lib/i18n/react';
import { useEditorGuard } from '@/stores/editor';
import { useSettings } from '@/stores/settings';
import { useVault } from '@/stores/vault';

/** Locks the live vault after N minutes without activity. Demo mode has no vault. */
export function useAutoLock(enabled: boolean): void {
  const minutes = useSettings((state) => state.security.autoLockMinutes);
  const navigate = useNavigate();
  const t = useT();

  useEffect(() => {
    if (!enabled || minutes <= 0) return;
    let timer: number | undefined;

    const arm = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void (async () => {
          if (useEditorGuard.getState().dirty) {
            const lockAnyway = await confirmAction(t('errors.hooks.autoLockMessage'), {
              description: t('errors.hooks.autoLockDescription'),
              confirmLabel: t('errors.hooks.autoLockConfirm'),
              cancelLabel: t('errors.hooks.autoLockCancel'),
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
  }, [enabled, minutes, navigate, t]);
}
