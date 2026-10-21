import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.STUDIO_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 更新交给用户确认：新 SW 装好后停留在 waiting，由 src/components/pwa-update.tsx 弹窗提示。
      registerType: 'prompt',
      // 注册在 React 里做（virtual:pwa-register/react），不要再注入第二个注册脚本。
      injectRegister: false,
      // dev 下 Service Worker 会缓存 HMR 模块；虚拟模块在 serve 下本身是 no-op。
      devOptions: { enabled: false },
      // manifest 的 start_url / scope 由插件按 Vite base 推导（支持 STUDIO_BASE 子路径），不要写死。
      // 图标 src 保持相对路径，部署在子路径时同样可用。
      manifest: {
        name: 'Astro Blog Studio',
        short_name: 'Studio',
        description: '浏览器里的博客 Markdown 工作台',
        lang: 'zh-CN',
        display: 'standalone',
        background_color: '#FFFBF5',
        theme_color: '#FFFBF5',
        categories: ['productivity'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 默认只预缓存 js/css/html；字体和图标必须显式加入，否则离线打开会丢字体。
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        // .woff/.ttf 只是旧浏览器的兜底，不占预缓存体积，需要时由下面的 runtimeCaching 缓存。
        // shiki 的语法 chunk 同理：只在读到对应语言的代码块时才下载，走运行时缓存，
        // 不要塞进安装阶段的预缓存清单（否则 40+ 门语言会把 PWA 体积翻倍）。
        globIgnores: ['**/*.{woff,ttf,map}', '**/assets/shiki/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        // prompt 模式：不自动接管页面，否则更新弹窗就没有意义了。
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        // 把 Workbox 运行时内联进 sw.js，少一个弱网下的启动依赖。
        inlineWorkboxRuntime: true,
        runtimeCaching: [
          // GitHub API 的响应（可能含私有内容）一律不写进 CacheStorage；
          // GraphQL POST 不走 Workbox 路由，本来就是直接联网。
          { urlPattern: /^https:\/\/api\.github\.com\//, handler: 'NetworkOnly' },
          {
            urlPattern: /\.(?:woff|ttf)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'studio-legacy-fonts', expiration: { maxEntries: 24 } },
          },
          // 语法高亮 chunk：第一次读到该语言的代码块时缓存，之后离线也能着色。
          {
            urlPattern: /\/assets\/shiki\/.+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'studio-shiki',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/.*.tmpdir/**', '**/*.tmp', '**/.git/**'],
    },
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        // shiki 的按需语法 chunk 单独放一个目录：Service Worker 靠这个目录名
        // 把它们排除出预缓存，交给 runtimeCaching。
        chunkFileNames: (chunkInfo) => {
          const shikiOnly =
            chunkInfo.moduleIds.length > 0 &&
            chunkInfo.moduleIds.every((id) => /[\\/]shiki[\\/]|@shikijs[\\/]|oniguruma-to-es/.test(id));
          return shikiOnly ? 'assets/shiki/[name]-[hash].js' : 'assets/[name]-[hash].js';
        },
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // shiki 只在预览出现代码块时按需动态 import：交给 Rollup 自然切分，
          // 不要并进首屏 vendor，否则未用到的语法也会被塞进初始包。
          if (/[\\/]shiki[\\/]|@shikijs[\\/]|oniguruma-to-es/.test(id)) return undefined;
          if (id.includes('@codemirror') || id.includes('@uiw') || id.includes('@lezer')) return 'editor';
          if (id.includes('marked') || id.includes('katex') || id.includes('dompurify')) return 'markdown';
          if (id.includes('@octokit')) return 'github';
          if (id.includes('@fingerprintjs')) return 'fingerprint';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('@tanstack') || id.includes('zustand')) return 'state';
          if (id.includes('react') || id.includes('scheduler')) return 'react';
          return 'vendor';
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
