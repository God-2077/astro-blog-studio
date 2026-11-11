import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { unlockReturnState } from '@/lib/navigation/unlock-return';
import { useSettings } from '@/stores/settings';
import { useVault } from '@/stores/vault';

/**
 * Locks a password-protected vault after N minutes without activity.
 * The lock is unconditional: open edits are flushed to the encrypted local
 * draft store first, so there is nothing to confirm.
 */
export function useAutoLock(enabled: boolean): void {
  const minutes = useSettings((state) => state.security.autoLockMinutes);
  const navigate = useNavigate();
  const location = useLocation();
  // 计时器不应因为路由变化而重置，但锁定发生时要知道当前页面。
  const locationRef = useRef(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    if (!enabled || minutes <= 0) return;
    let timer: number | undefined;

    const arm = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void (async () => {
          await useVault.getState().lock();
          navigate('/unlock', { state: unlockReturnState(locationRef.current) });
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
