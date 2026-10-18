import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.STUDIO_BASE ?? '/',
  plugins: [react(), tailwindcss()],
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
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
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
