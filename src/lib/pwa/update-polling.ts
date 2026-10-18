/**
 * 版本更新检测的唯一实现：节流 + single-flight + 失败静默。
 *
 * 这里的“更新”指 Service Worker 发现新的构建（sw.js 内联了预缓存清单，
 * 任何产物变化都会改变它）。检测只负责调用 registration.update()，
 * 弹窗与刷新由 src/components/pwa-update.tsx 决定。
 */

export const UPDATE_CHECK_INTERVAL_MS = 60_000;
/** 焦点 / 在线 / 可见性触发的检查之间至少间隔这么久，避免反复打扰弱网。 */
export const UPDATE_CHECK_MIN_GAP_MS = 10_000;

export interface UpdateChecker {
  run: (force?: boolean) => Promise<void>;
}

export function createUpdateChecker(options: {
  check: () => Promise<unknown>;
  minGapMs?: number;
  now?: () => number;
}): UpdateChecker {
  const { check, minGapMs = UPDATE_CHECK_MIN_GAP_MS, now = Date.now } = options;
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  let inFlight = false;

  return {
    async run(force = false) {
      // 还在检查中就不再排队：更新提示不是实时性要求很高的东西。
      if (inFlight) return;
      const startedAt = now();
      if (!force && startedAt - lastStartedAt < minGapMs) return;
      lastStartedAt = startedAt;
      inFlight = true;
      try {
        await check();
      } catch {
        // 离线、弱网、页面已关闭：检测失败不是用户需要处理的问题，也不该刷 toast。
      } finally {
        inFlight = false;
      }
    },
  };
}

type ListenerTarget = Pick<Document, 'addEventListener' | 'removeEventListener'>;
type WindowTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export interface UpdatePollingOptions {
  intervalMs?: number;
  minGapMs?: number;
  now?: () => number;
  isVisible?: () => boolean;
  isOnline?: () => boolean;
  documentTarget?: ListenerTarget;
  windowTarget?: WindowTarget;
}

/**
 * 定时 + 回到前台 / 窗口获得焦点 / 网络恢复时检查更新，返回停止函数。
 * 只在页面可见且在线时发起请求；隐藏标签页不消耗流量。
 */
export function startUpdatePolling(update: () => Promise<unknown>, options: UpdatePollingOptions = {}): () => void {
  const {
    intervalMs = UPDATE_CHECK_INTERVAL_MS,
    minGapMs = UPDATE_CHECK_MIN_GAP_MS,
    now,
    isVisible = () => document.visibilityState === 'visible',
    isOnline = () => navigator.onLine !== false,
    documentTarget = document,
    windowTarget = window,
  } = options;

  const checker = createUpdateChecker({ check: update, minGapMs, now });

  const check = (force = false): void => {
    if (!isVisible() || !isOnline()) return;
    void checker.run(force);
  };

  const timer: ReturnType<typeof setInterval> = setInterval(() => check(), intervalMs);
  const onVisibilityChange = (): void => {
    if (isVisible()) check();
  };
  const onFocus = (): void => check();
  const onOnline = (): void => check();

  documentTarget.addEventListener('visibilitychange', onVisibilityChange);
  windowTarget.addEventListener('focus', onFocus);
  windowTarget.addEventListener('online', onOnline);

  return () => {
    clearInterval(timer);
    documentTarget.removeEventListener('visibilitychange', onVisibilityChange);
    windowTarget.removeEventListener('focus', onFocus);
    windowTarget.removeEventListener('online', onOnline);
  };
}
