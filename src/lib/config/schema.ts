import { z } from 'zod';

export const repoSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  branch: z.string().min(1),
});

export const settingsSchema = z.object({
  version: z.literal(1),
  repo: repoSchema.nullable(),
  content: z.object({
    rootDir: z.string(),
    extensions: z.array(z.string()),
    excludes: z.array(z.string()),
    timezone: z.string().min(1),
  }),
  commit: z.object({
    create: z.string(),
    update: z.string(),
    delete: z.string(),
    move: z.string(),
    confirmBeforeCommit: z.boolean(),
  }),
  editor: z.object({
    defaultDir: z.string(),
    filenameTemplate: z.string(),
    frontmatterTemplate: z.string(),
    updateUpdatedAt: z.boolean(),
    layout: z.enum(['split', 'editor', 'preview']),
    showLineNumbers: z.boolean(),
    fontSize: z.number().min(12).max(20),
    externalImages: z.boolean(),
  }),
  appearance: z.object({
    theme: z.enum(['native', 'night']),
    motion: z.enum(['full', 'reduced', 'off']),
    density: z.enum(['cozy', 'compact']),
  }),
  security: z.object({
    autoLockMinutes: z.number().min(0).max(240),
    deviceBindingForPassword: z.boolean(),
  }),
  advanced: z.object({
    debug: z.boolean(),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;
export type RepoConfig = z.infer<typeof repoSchema>;
