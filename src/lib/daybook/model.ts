import type { FrontmatterField } from '@/lib/frontmatter/fields';
import { serializeFieldLines } from '@/lib/markdown/document';
import { basename, dirname, isMarkdownFile, normalizeRepoPath } from '@/lib/paths/paths';
import { padNumber } from '@/lib/utils/date';

export const DAYBOOK_KINDS = ['daily', 'post', 'page'] as const;

export type DaybookKind = (typeof DAYBOOK_KINDS)[number];

/** The three content directories of an astro-daybook repository. */
export const DAYBOOK_DIRS: Record<DaybookKind, string> = {
  daily: 'daily',
  post: 'post',
  page: 'pages',
};

/** Non-content files that stay visible in the index card for quick editing. */
export const DAYBOOK_AUX_PATHS = ['config/site.ts', 'config/links.ts', 'spec/about.mdx'] as const;

/**
 * Field sets mirror temp/content/schema.ts: daily and post extend the shared
 * base fields, while page has its own smaller shape (no slug/permalink/pin).
 */
export const DAYBOOK_FIELDS: Record<DaybookKind, FrontmatterField[]> = {
  daily: [
    { name: 'date', type: 'datetime', required: true },
    { name: 'title', type: 'string', required: false },
    { name: 'category', type: 'string', required: false },
    { name: 'hideHomeTitle', type: 'boolean', required: false },
    { name: 'updated', type: 'datetime', required: false },
    { name: 'description', type: 'string', required: false },
    { name: 'slug', type: 'string', required: false },
    { name: 'permalink', type: 'string', required: false },
    { name: 'draft', type: 'boolean', required: false },
    { name: 'pin', type: 'boolean', required: false },
    { name: 'password', type: 'string', required: false },
    { name: 'hideFrom', type: 'list', required: false },
    { name: 'comments', type: 'boolean', required: false },
  ],
  post: [
    { name: 'date', type: 'datetime', required: true },
    { name: 'title', type: 'string', required: true },
    { name: 'categories', type: 'list', required: false },
    { name: 'tags', type: 'list', required: false },
    { name: 'keywords', type: 'list', required: false },
    { name: 'updated', type: 'datetime', required: false },
    { name: 'description', type: 'string', required: false },
    { name: 'slug', type: 'string', required: false },
    { name: 'permalink', type: 'string', required: false },
    { name: 'draft', type: 'boolean', required: false },
    { name: 'pin', type: 'boolean', required: false },
    { name: 'password', type: 'string', required: false },
    { name: 'hideFrom', type: 'list', required: false },
    { name: 'comments', type: 'boolean', required: false },
  ],
  page: [
    { name: 'title', type: 'string', required: true },
    { name: 'date', type: 'datetime', required: false },
    { name: 'updated', type: 'datetime', required: false },
    { name: 'description', type: 'string', required: false },
    { name: 'draft', type: 'boolean', required: false },
    { name: 'hideFrom', type: 'list', required: false },
    { name: 'comments', type: 'boolean', required: false },
  ],
};

const EMPTY_FIELDS: FrontmatterField[] = [];

/** Type of a content file, or null for auxiliary/unknown paths. */
export function daybookKindForPath(path: string): DaybookKind | null {
  const normalized = normalizeRepoPath(path);
  for (const kind of DAYBOOK_KINDS) {
    if (normalized.startsWith(`${DAYBOOK_DIRS[kind]}/`)) return kind;
  }
  return null;
}

/** The editor form fields for a path; auxiliary files such as spec/about.mdx have none. */
export function daybookFieldsForPath(path: string): FrontmatterField[] {
  const kind = daybookKindForPath(path);
  return kind ? DAYBOOK_FIELDS[kind] : EMPTY_FIELDS;
}

/** Markdown files under daily/post/pages are content; config and spec files are not. */
export function isDaybookContentPath(path: string, extensions: readonly string[]): boolean {
  return daybookKindForPath(path) !== null && isMarkdownFile(path, extensions);
}

/** Exact auxiliary files plus the three content directories. */
export function isDaybookAllowlistedPath(path: string, extensions: readonly string[]): boolean {
  const normalized = normalizeRepoPath(path);
  if ((DAYBOOK_AUX_PATHS as readonly string[]).includes(normalized)) return true;
  return isDaybookContentPath(normalized, extensions);
}

const DAILY_FILE_RE = /^(\d{4}-\d{2}-\d{2})-(\d{2,})\.(?:md|mdx)$/i;

/**
 * Next diary sequence for a date. Only direct daily/ files named
 * YYYY-MM-DD-NN count; older date-slug files are ignored so the sequence starts
 * at 01, and the number has at least two digits.
 */
export function nextDailyFilename(paths: readonly string[], date: string): string {
  let max = 0;
  for (const path of paths) {
    const normalized = normalizeRepoPath(path);
    if (dirname(normalized) !== DAYBOOK_DIRS.daily) continue;
    const match = DAILY_FILE_RE.exec(basename(normalized));
    if (!match || match[1] !== date) continue;
    const value = Number(match[2]);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return `${date}-${padNumber(max + 1)}`;
}

export interface DaybookDocumentInput {
  title: string;
  date: string;
}

/** Initial frontmatter for a new daybook file, including every schema default. */
export function buildDaybookDocument(kind: DaybookKind, input: DaybookDocumentInput): string {
  const lines: string[] = [];
  const title = input.title.trim();
  const add = (key: string, value: unknown): void => {
    lines.push(...serializeFieldLines(key, value));
  };

  if (kind === 'daily') {
    add('date', input.date);
    if (title) add('title', title);
    add('draft', false);
    add('pin', false);
    add('comments', true);
    add('hideHomeTitle', false);
  } else if (kind === 'post') {
    add('date', input.date);
    if (title) add('title', title);
    add('categories', []);
    add('tags', []);
    add('keywords', []);
    add('draft', false);
    add('pin', false);
    add('comments', true);
  } else {
    if (title) add('title', title);
    add('date', input.date);
    add('draft', false);
    add('hideFrom', []);
    add('comments', true);
  }

  return `---\n${lines.join('\n')}\n---\n\n`;
}
