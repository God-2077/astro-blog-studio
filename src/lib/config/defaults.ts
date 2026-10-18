import { cloneFrontmatterFields, DEFAULT_FRONTMATTER_FIELDS } from '@/lib/frontmatter/fields';
import { INDEX_CONCURRENCY_DEFAULT, type Settings } from './schema';

export const SUGGESTED_EXCLUDES = ['src/content/blog/en', 'src/content/blog/ja', 'src/pages/en', 'src/pages/ja'];

export const defaultSettings: Settings = {
  version: 1,
  repo: null,
  content: {
    rootDir: 'src',
    extensions: ['.md', '.mdx'],
    excludes: [],
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
    defaultDir: 'src/content/blog',
    filenameTemplate: '{title}',
    updateUpdatedAt: true,
    layout: 'split',
    showLineNumbers: false,
    fontSize: 15,
    externalImages: true,
  },
  frontmatter: {
    fields: cloneFrontmatterFields(DEFAULT_FRONTMATTER_FIELDS),
  },
  appearance: {
    theme: 'system',
    motion: 'full',
    density: 'cozy',
  },
  security: {
    autoLockMinutes: 15,
    deviceBindingForPassword: false,
  },
  advanced: {
    debug: false,
  },
};
