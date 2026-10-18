import { z } from 'zod';
import { DEFAULT_FRONTMATTER_FIELDS, FRONTMATTER_FIELD_TYPES } from '@/lib/frontmatter/fields';

export const repoSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  branch: z.string().min(1),
});

export const frontmatterFieldSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(FRONTMATTER_FIELD_TYPES),
  required: z.boolean(),
});

export const frontmatterSettingsSchema = z
  .object({
    fields: z.array(frontmatterFieldSchema),
  })
  .default({ fields: DEFAULT_FRONTMATTER_FIELDS });

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
    updateUpdatedAt: z.boolean(),
    layout: z.enum(['split', 'editor', 'preview']),
    showLineNumbers: z.boolean(),
    fontSize: z.number().min(12).max(20),
    externalImages: z.boolean(),
  }),
  frontmatter: frontmatterSettingsSchema,
  appearance: z.object({
    // native 是早期版本的无界面占位值，读取时迁移到 system。
    theme: z
      .enum(['native', 'system', 'day', 'night'])
      .transform((value) => (value === 'native' ? 'system' : value))
      .catch('system'),
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
export type FrontmatterSettings = z.infer<typeof frontmatterSettingsSchema>;
