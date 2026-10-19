import { normalizeExclude, normalizeRepoPath } from '@/lib/paths/paths';
import { INDEX_CHUNK_SIZE, MAX_INDEX_FILES } from '@/lib/posts/summary';
import type { TreeConfig } from '@/lib/tree/model';

/** Bump when the on-disk record shape or AAD changes; old records are then ignored. */
export const CONTENT_CACHE_VERSION = 1;

/** The cache covers the same slice of the tree as the dashboard index. */
export const CONTENT_MAX_FILES = MAX_INDEX_FILES;

/** One GraphQL `readFiles` call is 20 blobs. */
export const CONTENT_CHUNK_SIZE = INDEX_CHUNK_SIZE;

/** Matches `MAX_FILE_BYTES` in the live gateway; larger posts are never indexed. */
export const MAX_CONTENT_FILE_CHARS = 1_000_000;

export type ContentMode = 'demo' | 'live';

export interface ContentTarget {
  path: string;
  sha: string;
}

export interface ContentFile {
  path: string;
  sha: string;
  text: string;
  size: number;
}

export interface ContentMetaFile {
  path: string;
  sha: string;
  chars: number;
}

/**
 * Everything needed to diff the next HEAD tree without reading a single blob:
 * the tree sha, the config signature and the path/blob-sha list. Encrypted at
 * rest, so article paths never sit in IndexedDB as plaintext.
 */
export interface ContentMeta {
  version: typeof CONTENT_CACHE_VERSION;
  repoKey: string;
  signature: string;
  treeSha: string;
  savedAt: number;
  files: ContentMetaFile[];
}

export interface ContentSnapshot {
  meta: ContentMeta;
  files: Map<string, ContentFile>;
}

/** Repo + branch identity for the local article cache (mirrors the backup key). */
export function contentRepoKey(mode: ContentMode, repo: { owner: string; name: string }, branch: string): string {
  return `${mode}:${repo.owner}/${repo.name}@${branch}`;
}

/**
 * Meta and article rows share one IndexedDB object store (`idb-keyval` opens a
 * database per store name, so two `createStore` calls on the same DB would race
 * on the upgrade and leave one store missing). Prefixes keep the namespaces
 * apart and make prefix clearing a simple key scan.
 */
const META_PREFIX = 'meta\u0000';
const FILE_PREFIX = 'file\u0000';

export function contentMetaKey(repoKey: string): string {
  return `${META_PREFIX}${repoKey}`;
}

export function contentFileKey(repoKey: string, path: string): string {
  return `${FILE_PREFIX}${repoKey}\u0000${normalizeRepoPath(path)}`;
}

export function contentFilePrefix(repoKey: string): string {
  return `${FILE_PREFIX}${repoKey}\u0000`;
}

/** File-key prefix for a repo prefix such as `live:` (no path separator). */
export function contentFilePrefixFor(repoPrefix: string): string {
  return `${FILE_PREFIX}${repoPrefix}`;
}

export function contentMetaPrefix(repoKey: string): string {
  return `${META_PREFIX}${repoKey}`;
}

/**
 * Cache identity for the content config. Changing the root dir, extensions or
 * exclusions changes which posts exist, so the cache must be rebuilt instead of
 * diffed against a different file set.
 */
export function contentSignature(config: TreeConfig): string {
  const extensions = [...new Set(config.extensions.map((entry) => entry.trim().toLowerCase()).filter(Boolean))].sort();
  const excludes = [
    ...new Set(config.excludes.map((entry) => normalizeExclude(entry)).filter((entry): entry is string => Boolean(entry))),
  ].sort();
  return `${normalizeRepoPath(config.rootDir)}\u0000${extensions.join(',')}\u0000${excludes.join('\n')}`;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isSafePath(path: string): boolean {
  if (!path || path !== normalizeRepoPath(path) || path.includes('\u0000')) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

export function metaFileOf(file: ContentFile): ContentMetaFile {
  return { path: file.path, sha: file.sha, chars: file.text.length };
}

/**
 * IndexedDB is a trust boundary for old/foreign records. Validate the whole meta
 * shape, cap the file list and reject duplicate or unsafe paths.
 */
export function isContentMeta(value: unknown): value is ContentMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  if (raw.version !== CONTENT_CACHE_VERSION) return false;
  const repoKey = readString(raw.repoKey);
  const signature = readString(raw.signature);
  const treeSha = readString(raw.treeSha);
  if (!repoKey || !signature || !treeSha) return false;
  if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt) || raw.savedAt <= 0) return false;
  if (!Array.isArray(raw.files)) return false;
  const files = raw.files as unknown[];
  if (files.length > CONTENT_MAX_FILES) return false;

  const seen = new Set<string>();
  for (const entry of files) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const file = entry as Record<string, unknown>;
    const path = readString(file.path);
    const sha = readString(file.sha);
    if (!path || !isSafePath(path) || !sha) return false;
    if (typeof file.chars !== 'number' || !Number.isFinite(file.chars) || file.chars < 0) return false;
    if (seen.has(path)) return false;
    seen.add(path);
  }
  return true;
}

export function isContentFile(value: unknown): value is ContentFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  const path = readString(raw.path);
  const sha = readString(raw.sha);
  if (!path || !isSafePath(path) || !sha) return false;
  if (typeof raw.text !== 'string' || raw.text.length > MAX_CONTENT_FILE_CHARS) return false;
  return raw.size === raw.text.length;
}
