import { cloneFrontmatterFields } from '@/lib/frontmatter/fields';
import { repoKindPreset } from '@/lib/repos/kinds';
import { INDEX_CONCURRENCY_DEFAULT, type Settings } from './schema';

export const SUGGESTED_EXCLUDES = [];

const BLOG_PRESET = repoKindPreset('blog');

export const defaultSettings: Settings = {
  version: 1,
  repo: null,
  repos: [],
  content: {
    ...BLOG_PRESET.content,
    timezone: 'Asia/Shanghai',
    indexConcurrency: INDEX_CONCURRENCY_DEFAULT,
  },
  commit: {
    create: 'create: {path}',
    update: 'update: {path}',
    delete: 'delete: {path}',
    move: 'update: {oldPath} → {newPath}',
    confirmBeforeCommit: true,
  },
  editor: {
    defaultDir: 'src',
    filenameTemplate: '{title}',
    updateUpdatedAt: true,
    layout: 'split',
    showLineNumbers: false,
    fontSize: 15,
    externalImages: true,
    backupUnsaved: true,
  },
  frontmatter: {
    fields: cloneFrontmatterFields(BLOG_PRESET.fallbackFields),
  },
  appearance: {
    theme: 'system',
    motion: 'full',
    density: 'cozy',
  },
  security: {
    autoLockMinutes: 15,
  },
  advanced: {
    debug: false,
  },
};
