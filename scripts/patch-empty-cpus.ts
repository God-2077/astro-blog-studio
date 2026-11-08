import os from 'node:os';

/**
 * Termux/Android 的 Node 有时读不到 CPU 信息，`os.cpus()` 会返回空数组。
 *
 * `@rollup/plugin-terser` 把 `os.cpus().length` 直接当作 worker 池大小；为 0 时
 * 它不会创建任何 worker，`renderChunk` 返回的 Promise 永远不会 resolve。workbox
 * 生成 Service Worker 时正好走这条链路，构建最终报：
 *
 *   Error: Unable to write the service worker file.
 *   'Unexpected early exit. ... Unfinished hook action(s) on exit: (terser) renderChunk'
 *
 * 上游 issue：https://github.com/rollup/plugins/issues/1594（仍未修复）。
 * 这里只在空数组时用 `availableParallelism()` 兜底；正常平台不会走到这里。
 */
export function patchEmptyOsCpus(): void {
  if (os.cpus().length > 0) return;

  const count = Math.max(1, os.availableParallelism());
  Object.defineProperty(os, 'cpus', {
    configurable: true,
    writable: true,
    value: () =>
      Array.from({ length: count }, () => ({
        model: 'unknown',
        speed: 0,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      })),
  });
}
