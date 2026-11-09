[← 返回 README](../README.md)

# Termux / Android 构建失败：原因与修复

记录 `pnpm build` 在 Termux（aarch64 Android）下生成 Service Worker 失败的问题、根因、修复方案与验证结果。修复日期：2026-11-08。

## 现象

`pnpm build` 的 `tsc --noEmit` 和 Vite 前端产物都正常，最后在 workbox 生成 PWA Service Worker 时失败：

```text
PWA v2.0.0
mode      generateSW
error during build:
Error: Unable to write the service worker file. 'Unexpected early exit. This happens when Promises returned by plugins cannot resolve. Unfinished hook action(s) on exit:
(terser) renderChunk'
    at writeSWUsingDefaultTemplate (.../workbox-build/build/lib/write-sw-using-default-template.js:68:15)
    at async generateSW (.../workbox-build/build/generate-sw.js:95:23)
    ...
```

`tsc`、主应用 bundle、CSS、字体、图标都已经生成，只有 `dist/sw.js` 没有写出来。

## 复现环境

| 项目 | 值 |
| --- | --- |
| 平台 | Termux / Android aarch64 |
| Node | v25.8.1（`engines` 要求 ≥ 20.19） |
| pnpm | 11.0.9 |
| Vite | 7.3.7 |
| vite-plugin-pwa | 2.0.0 |
| workbox-build | 7.4.1 |
| @rollup/plugin-terser | 1.0.0（最新 1.0.2 仍有同样逻辑） |

关键环境差异：

```bash
node -e "console.log(os.cpus())"                   # []
node -e "console.log(os.availableParallelism())"   # 8
head -3 /proc/stat                                 # Permission denied
```

## 根因

1. Android 限制读取 `/proc/stat`，Node 的 `os.cpus()`（libuv `uv_cpu_info`）拿不到 CPU 拓扑，返回空数组；`os.availableParallelism()` 走 `sched_getaffinity`，仍然能得到 8。
2. workbox 用 Rollup + `@rollup/plugin-terser` 压缩 `sw.js`。
3. `@rollup/plugin-terser` 的 WorkerPool 默认值直接取 CPU 数：

   ```js
   this.maxInstances = options.maxWorkers || os.cpus().length; // 0
   ```

4. worker 数为 0 时，`runTask` 的判断永远不成立：

   ```js
   if (this.numWorkers < this.maxInstances) {
     this.addNewWorker(); // 0 < 0，永远进不来
   }
   ```

   任务只进入队列，`renderChunk` 返回的 Promise 永远不会 resolve。
5. 没有待处理的 worker/句柄，Node 事件循环提前空掉，Rollup 的 `handleBeforeExit` 报 `Unexpected early exit ... (terser) renderChunk`，workbox 再包装成 `Unable to write the service worker file`。

主应用 bundle 默认由 Vite/esbuild 压缩，不经过 terser，所以只有 PWA 的 Service Worker 阶段失败。

上游已确认该问题：[rollup/plugins#1594](https://github.com/rollup/plugins/issues/1594)。修复 PR [#1604](https://github.com/rollup/plugins/pull/1604) 已被关闭，截至 `@rollup/plugin-terser@1.0.2` 仍未合并。

## 修复

新增 `scripts/patch-empty-cpus.ts`：只在 `os.cpus()` 返回空数组时，用 `os.availableParallelism()` 补一份占位 CPU 列表；正常平台直接返回，不做任何修改。

```ts
import os from 'node:os';

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
```

在 `vite.config.ts` 加载 PWA 插件前调用：

```ts
import { patchEmptyOsCpus } from './scripts/patch-empty-cpus';

// Termux/Android 的 os.cpus() 可能为空，会让 workbox 的 terser 阶段卡死；必须在插件运行前执行。
patchEmptyOsCpus();
```

### 为什么选这个方案

- 保留 `sw.js` 的 terser 压缩产物，不改变发布质量。
- 不需要 `pnpm patch` 维护依赖补丁，升级 workbox / vite-plugin-pwa 后也不会失效。
- 对所有构建入口生效，包括 `pnpm build`、Playwright 里的 `pnpm exec vite build`、`pnpm preview` 前置构建。
- 只修改当前 Node 进程的 `os.cpus`；Node 内部不调用这个 JS 函数，Vite / Vitest 使用 `availableParallelism()`，没有其他影响。

### 备选方案

| 方案 | 结果 | 未采用原因 |
| --- | --- | --- |
| `workbox.mode: 'development'` | 跳过 terser，构建成功 | Termux 下 `sw.js` 不压缩，发布产物与其他平台不一致 |
| `pnpm patch @rollup/plugin-terser` | 修依赖本身，产物一致 | 需要维护补丁文件，依赖升级时可能失配 |
| `NODE_OPTIONS=--import=...` | 预加载补丁，构建成功 | 只覆盖 `pnpm build`，覆盖不到 Playwright 直接执行的 `vite build` |
| 升级 `@rollup/plugin-terser` | 无效 | 最新 1.0.2 仍使用 `os.cpus().length` |

## 验证

- `pnpm typecheck` ✅
- `pnpm build` ✅
  - `dist/sw.js` 正常生成并保持压缩（约 25 KB）
  - 预缓存 50 条，约 2.5 MiB
- `pnpm dev` ✅ 正常启动

修复前：`pnpm build` 在 workbox 阶段退出码 1，`dist/sw.js` 缺失。
修复后：构建退出码 0，`dist/sw.js`、`dist/manifest.webmanifest`、图标齐全。

## 附注：Termux 下其他非构建问题

这两个问题与本次构建失败无关，但同属 Termux / 新 Node 的环境差异：

- **`pnpm lint` 无法运行**：Biome 没有 Android/Bionic 的预编译二进制，会提示 `The Biome CLI package doesn't ship with prebuilt binaries for your platform yet`。因此 `pnpm verify` 会在 lint 阶段失败。
- **`pnpm test` 大量失败**：Node 25 内置了一个缺少 `setItem` / `removeItem` / `clear` 的全局 `localStorage`，而 `tests/setup.ts` 只在 `localStorage === undefined` 时安装测试替身。单元测试因此在写设置、保险库、i18n 时抛 `localStorage.setItem is not a function`。可把 setup 的判断改成「没有可用的 `setItem` 就安装替身」来兼容 Node 25。
