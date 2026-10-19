import { parseDocument } from '@/lib/markdown/document';

export interface PostSummary {
  path: string;
  title: string;
  date: string;
  updated?: string;
  categories: string[];
  tags: string[];
  draft: boolean;
  sticky: boolean;
  encrypted: boolean;
  frontmatterError: boolean;
  bodyLength: number;
}

/** Minimal shape the index needs from a tree entry. `FileNode` is assignable. */
export interface IndexEntry {
  path: string;
  sha: string;
}

/** One batch == one `readFiles` call == one GraphQL request (GRAPHQL_BATCH_SIZE is 20). */
export const INDEX_CHUNK_SIZE = 20;

/** How many 「最近动过」 rows one page shows; 「加载更多」 appends the same amount. */
export const RECENT_PAGE_SIZE = 20;

/** `updated` orders by last edit (falling back to date); `date` orders by publish date. */
export type PostSortKey = 'updated' | 'date';

/** Hard ceiling so a pathological repo cannot burn the whole API quota. */
export const MAX_INDEX_FILES = 1000;

export interface IndexPlan {
  chunks: IndexEntry[][];
  /** Every visible markdown file. */
  total: number;
  /** How many of them this plan actually indexes (total capped at MAX_INDEX_FILES). */
  indexed: number;
}

export function planIndex(entries: IndexEntry[], size: number = INDEX_CHUNK_SIZE, max: number = MAX_INDEX_FILES): IndexPlan {
  const total = entries.length;
  const limit = Number.isFinite(max) && max > 0 ? Math.trunc(max) : MAX_INDEX_FILES;
  const indexed = Math.min(total, limit);
  const selected = indexed < total ? entries.slice(0, indexed) : entries;
  const step = Number.isFinite(size) && size > 0 ? Math.trunc(size) : INDEX_CHUNK_SIZE;

  const chunks: IndexEntry[][] = [];
  for (let index = 0; index < selected.length; index += step) {
    chunks.push(selected.slice(index, index + step));
  }
  return { chunks, total, indexed };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function flattenCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (Array.isArray(item)) result.push(...item.filter((part): part is string => typeof part === 'string'));
    else if (typeof item === 'string') result.push(item);
  }
  return [...new Set(result)];
}

function flattenTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === 'string');
}

export function summarize(text: string, path: string): PostSummary {
  const parsed = parseDocument(text);
  const data = parsed.data;
  const title = asString(data.title) ?? path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  return {
    path,
    title,
    date: asString(data.date) ?? '',
    updated: asString(data.updated),
    categories: flattenCategories(data.categories),
    tags: flattenTags(data.tags),
    draft: data.draft === true,
    sticky: data.sticky === true,
    encrypted: Boolean(data.password),
    frontmatterError: Boolean(parsed.frontmatterError),
    bodyLength: parsed.body.length,
  };
}

/** The value a post is sorted by: `updated` wins, otherwise `date`. */
export function postTimestamp(post: PostSummary): string {
  return postSortValue(post, 'updated');
}

/**
 * The frontmatter value used for a given sort mode. `date` falls back to
 * `updated` when a post has no publish date; `updated` keeps the old behavior.
 */
export function postSortValue(post: PostSummary, key: PostSortKey = 'updated'): string {
  if (key === 'date') return post.date || post.updated || '';
  return post.updated || post.date || '';
}

const LOCAL_DATE_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
const ZONED_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Milliseconds for a frontmatter date, used only for ordering.
 * Handles the formats the studio writes (`YYYY-MM-DD HH:mm:ss`), plain dates,
 * and falls back to `Date.parse` for ISO strings carrying an explicit zone.
 * Returns NaN when the value cannot be understood.
 */
export function postRecencyMs(value: string | undefined): number {
  if (!value) return Number.NaN;
  const text = value.trim();
  if (!text) return Number.NaN;

  if (!ZONED_SUFFIX_RE.test(text)) {
    const match = LOCAL_DATE_RE.exec(text);
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      const ms = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        hour ? Number(hour) : 0,
        minute ? Number(minute) : 0,
        second ? Number(second) : 0,
      );
      if (Number.isFinite(ms)) return ms;
    }
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function comparePosts(a: PostSummary, b: PostSummary, key: PostSortKey): number {
  const timeA = postRecencyMs(postSortValue(a, key));
  const timeB = postRecencyMs(postSortValue(b, key));
  const missingA = Number.isNaN(timeA);
  const missingB = Number.isNaN(timeB);
  if (missingA !== missingB) return missingA ? 1 : -1;
  if (!missingA && !missingB && timeA !== timeB) return timeB - timeA;
  return a.path.localeCompare(b.path);
}

/** Newest-first copy of the list for the chosen frontmatter key. */
export function sortPosts(posts: PostSummary[], key: PostSortKey = 'updated'): PostSummary[] {
  return [...posts].sort((a, b) => comparePosts(a, b, key));
}

/**
 * Newest `limit` posts across the *whole* index. Sorting happens before slicing,
 * which is the bug this replaces: the old dashboard sliced the path-sorted tree
 * first and only then sorted those 12 posts.
 */
export function pickRecent(posts: PostSummary[], limit: number, key: PostSortKey = 'updated'): PostSummary[] {
  if (limit <= 0) return [];
  return sortPosts(posts, key).slice(0, limit);
}
