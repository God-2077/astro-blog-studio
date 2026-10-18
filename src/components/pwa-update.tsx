import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { PwaUpdateDialog } from '@/components/pwa-update-dialog';
import { startUpdatePolling } from '@/lib/pwa/update-polling';
import { usePwaUpdate } from '@/stores/pwa';

/** 由 <PwaUpdate /> 持有；重复挂载时先停掉上一个轮询。 */
let stopPolling: (() => void) | null = null;

/**
 * PWA 的运行时入口：注册 Service Worker、轮询更新、把状态同步给 store，并渲染更新弹窗。
 * 在 `pnpm dev` 下 virtual:pwa-register/react 是 no-op stub，这里什么都不做。
 */
export function PwaUpdate() {
  const markNeedRefresh = usePwaUpdate((state) => state.markNeedRefresh);
  const setApplyUpdate = usePwaUpdate((state) => state.setApplyUpdate);

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    // 等 window load 之后再注册：首屏资源不跟后台预缓存抢带宽，弱网下差别明显。
    immediate: false,
    onRegisteredSW: (_swUrl, registration) => {
      if (!registration) return;
      stopPolling?.();
      stopPolling = startUpdatePolling(() => registration.update());
    },
    onRegisterError: (error) => {
      // 不支持 SW / 非安全上下文 / 部署路径不对：PWA 只是增强项，不打扰用户。
      if (import.meta.env.DEV) console.debug('[pwa] service worker 注册失败', error);
    },
  });

  const [isUpdateReady] = needRefresh;
  const [isOfflineReady] = offlineReady;

  useEffect(() => {
    // 直接传函数本体：setApplyUpdate 是普通 setter，不是 React 的 setState，
    // 传 `() => updateServiceWorker` 会被存成 thunk，点「立即刷新」时只会返回函数而不发消息。
    setApplyUpdate(updateServiceWorker);
  }, [setApplyUpdate, updateServiceWorker]);

  useEffect(() => {
    if (isUpdateReady) markNeedRefresh();
  }, [isUpdateReady, markNeedRefresh]);

  useEffect(() => {
    if (!isOfflineReady) return;
    toast.success('已缓存，断网也能打开');
  }, [isOfflineReady]);

  useEffect(() => {
    return () => {
      stopPolling?.();
      stopPolling = null;
    };
  }, []);

  return <PwaUpdateDialog />;
}
