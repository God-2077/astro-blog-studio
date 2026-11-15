import { cloneFrontmatterFields, DEFAULT_FRONTMATTER_FIELDS, type FrontmatterField } from '@/lib/frontmatter/fields';
import { normalizeRepoPath } from '@/lib/paths/paths';

/**
 * Repository presets. `repoKind` lives in `content` (not in the repo identity)
 * because it describes the content layout, and the active repository already
 * materializes `content` into settings.
 */
export const REPO_KINDS = ['blog', 'daybook'] as const;

export type RepoKind = (typeof REPO_KINDS)[number];

export type RepoKindLabelKey = 'common.repoKind.blog' | 'common.repoKind.daybook';
export type RepoKindDescriptionKey = 'common.repoKind.blogDescription' | 'common.repoKind.daybookDescription';

export interface RepoContentPreset {
  repoKind: RepoKind;
  rootDir: string;
  extensions: string[];
  excludes: string[];
}

export interface RepoKindPreset {
  content: RepoContentPreset;
  fallbackFields: FrontmatterField[];
}

export type DaybookCollectionId = 'daily' | 'post' | 'pages' | 'spec';

export type DaybookCollectionLabelKey =
  | 'common.collection.daily'
  | 'common.collection.post'
  | 'common.collection.pages'
  | 'common.collection.spec';

export interface DaybookCollection {
  id: DaybookCollectionId;
  dir: string;
  labelKey: DaybookCollectionLabelKey;
  /** `required`: title drives the filename; `optional`: shown but filename defaults; `none`: body only. */
  titleMode: 'required' | 'optional' | 'none';
  creatable: boolean;
  /** Filename used when the user leaves the field empty. */
  defaultFilename: 'title' | 'date';
  fields: FrontmatterField[];
}

const DAYBOOK_EXCLUDES = ['*.md', '*.mdx', 'public', 'config', '.github', 'node_modules'];

const DAYBOOK_DAILY_FIELDS: FrontmatterField[] = [
  { name: 'date', type: 'date', required: true },
  { name: 'title', type: 'string', required: false },
  { name: 'description', type: 'string', required: false },
  { name: 'updated', type: 'date', required: false },
  { name: 'category', type: 'string', required: false },
  { name: 'slug', type: 'string', required: false },
  { name: 'permalink', type: 'string', required: false },
  { name: 'draft', type: 'boolean', required: false },
  { name: 'pin', type: 'boolean', required: false },
  { name: 'password', type: 'string', required: false },
  { name: 'hideFrom', type: 'list', required: false, hintKey: 'common.fieldHint.daybookHideFrom' },
  { name: 'comments', type: 'boolean', required: false, defaultValue: true },
  { name: 'hideHomeTitle', type: 'boolean', required: false },
];

const DAYBOOK_POST_FIELDS: FrontmatterField[] = [
  { name: 'title', type: 'string', required: true },
  { name: 'date', type: 'date', required: true },
  { name: 'updated', type: 'date', required: false },
  { name: 'description', type: 'string', required: false },
  { name: 'categories', type: 'list', required: false, hintKey: 'common.fieldHint.daybookCategories' },
  { name: 'tags', type: 'list', required: false },
  { name: 'keywords', type: 'list', required: false },
  { name: 'slug', type: 'string', required: false },
  { name: 'permalink', type: 'string', required: false },
  { name: 'draft', type: 'boolean', required: false },
  { name: 'pin', type: 'boolean', required: false },
  { name: 'password', type: 'string', required: false },
  { name: 'hideFrom', type: 'list', required: false, hintKey: 'common.fieldHint.daybookHideFrom' },
  { name: 'comments', type: 'boolean', required: false, defaultValue: true },
];

const DAYBOOK_PAGE_FIELDS: FrontmatterField[] = [
  { name: 'title', type: 'string', required: true },
  { name: 'date', type: 'date', required: false },
  { name: 'updated', type: 'date', required: false },
  { name: 'description', type: 'string', required: false },
  { name: 'draft', type: 'boolean', required: false },
  { name: 'hideFrom', type: 'list', required: false, hintKey: 'common.fieldHint.daybookHideFrom' },
  { name: 'comments', type: 'boolean', required: false, defaultValue: true },
];

const DAYBOOK_FALLBACK_FIELDS: FrontmatterField[] = [
  { name: 'title', type: 'string', required: false },
  { name: 'date', type: 'date', required: false },
  { name: 'description', type: 'string', required: false },
  { name: 'draft', type: 'boolean', required: false },
];

/**
 * Mirrors `content/schema.ts` in the Daybook content repository. These field
 * sets are code-defined on purpose: the theme schema is strict, so letting the
 * settings form add arbitrary keys would produce content that fails to build.
 */
export const DAYBOOK_COLLECTIONS: readonly DaybookCollection[] = [
  {
    id: 'daily',
    dir: 'daily',
    labelKey: 'common.collection.daily',
    titleMode: 'optional',
    creatable: true,
    defaultFilename: 'date',
    fields: DAYBOOK_DAILY_FIELDS,
  },
  {
    id: 'post',
    dir: 'post',
    labelKey: 'common.collection.post',
    titleMode: 'required',
    creatable: true,
    defaultFilename: 'title',
    fields: DAYBOOK_POST_FIELDS,
  },
  {
    id: 'pages',
    dir: 'pages',
    labelKey: 'common.collection.pages',
    titleMode: 'required',
    creatable: true,
    defaultFilename: 'title',
    fields: DAYBOOK_PAGE_FIELDS,
  },
  {
    id: 'spec',
    dir: 'spec',
    labelKey: 'common.collection.spec',
    titleMode: 'none',
    creatable: false,
    defaultFilename: 'title',
    fields: [],
  },
];

const PRESETS: Record<RepoKind, RepoKindPreset> = {
  blog: {
    content: {
      repoKind: 'blog',
      rootDir: 'src',
      extensions: ['.md', '.mdx'],
      excludes: [],
    },
    fallbackFields: DEFAULT_FRONTMATTER_FIELDS,
  },
  daybook: {
    content: {
      repoKind: 'daybook',
      rootDir: '',
      extensions: ['.md', '.mdx'],
      excludes: DAYBOOK_EXCLUDES,
    },
    fallbackFields: DAYBOOK_FALLBACK_FIELDS,
  },
};

export function repoKindPreset(kind: RepoKind): RepoKindPreset {
  const preset = PRESETS[kind];
  return {
    content: {
      ...preset.content,
      extensions: [...preset.content.extensions],
      excludes: [...preset.content.excludes],
    },
    fallbackFields: cloneFrontmatterFields(preset.fallbackFields),
  };
}

/** Fresh copy of the repository-level fallback fields for a preset. */
export function fallbackFields(kind: RepoKind): FrontmatterField[] {
  return cloneFrontmatterFields(PRESETS[kind].fallbackFields);
}

export function repoKindLabelKey(kind: RepoKind): RepoKindLabelKey {
  return kind === 'daybook' ? 'common.repoKind.daybook' : 'common.repoKind.blog';
}

export function repoKindDescriptionKey(kind: RepoKind): RepoKindDescriptionKey {
  return kind === 'daybook' ? 'common.repoKind.daybookDescription' : 'common.repoKind.blogDescription';
}

/** Collections that can be created from the 「新建」 dialog. */
export function creatableDaybookCollections(): readonly DaybookCollection[] {
  return DAYBOOK_COLLECTIONS.filter((collection) => collection.creatable);
}

export function daybookCollectionById(id: DaybookCollectionId): DaybookCollection | null {
  return DAYBOOK_COLLECTIONS.find((collection) => collection.id === id) ?? null;
}

/**
 * Resolve a repository path to a Daybook collection. `rootDir` is stripped first
 * so a content repo mounted at `content/` still maps `content/daily/x.md` to `daily`.
 */
export function daybookCollectionOf(path: string, rootDir = ''): DaybookCollection | null {
  const normalized = normalizeRepoPath(path);
  const root = normalizeRepoPath(rootDir);
  const relative = root && normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : normalized;
  const first = relative.split('/')[0];
  return DAYBOOK_COLLECTIONS.find((collection) => collection.dir === first) ?? null;
}

export function isDaybookCollectionId(value: string): value is DaybookCollectionId {
  return DAYBOOK_COLLECTIONS.some((collection) => collection.id === value);
}

export interface FieldResolutionSettings {
  content: { repoKind: RepoKind; rootDir: string };
  frontmatter: { fields: readonly FrontmatterField[] };
}

/**
 * Daybook uses one field set per collection; anything outside a known collection
 * falls back to the repository-level fields. Blog repositories are unchanged.
 */
export function resolveFields(settings: FieldResolutionSettings, path: string | null | undefined): readonly FrontmatterField[] {
  if (settings.content.repoKind !== 'daybook' || !path) return settings.frontmatter.fields;
  const collection = daybookCollectionOf(path, settings.content.rootDir);
  return collection ? collection.fields : settings.frontmatter.fields;
}
