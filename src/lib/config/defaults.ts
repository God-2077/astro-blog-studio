import type { Settings } from './schema';

export const DEFAULT_FRONTMATTER_TEMPLATE = `---
title: '{title}'
date: '{date}'
draft: true
---
`;

export const SUGGESTED_EXCLUDES = ['src/content/blog/en', 'src/content/blog/ja', 'src/pages/en', 'src/pages/ja'];

export const defaultSettings: Settings = {
  version: 1,
  repo: null,
  content: {
    rootDir: 'src',
    extensions: ['.md', '.mdx'],
    excludes: [],
    timezone: 'Asia/Shanghai',
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
    frontmatterTemplate: DEFAULT_FRONTMATTER_TEMPLATE,
    updateUpdatedAt: true,
    layout: 'split',
    showLineNumbers: false,
    fontSize: 15,
    externalImages: true,
  },
  appearance: {
    theme: 'native',
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
