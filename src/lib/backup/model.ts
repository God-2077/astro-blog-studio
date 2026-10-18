import { buildFrontmatterPatch, type FrontmatterField, type FrontmatterFormValues } from '@/lib/frontmatter/fields';
import {
  composeDocument,
  type DocumentMeta,
  parseDocument,
  toEditingText,
  updateFrontmatterRaw,
} from '@/lib/markdown/document';

export const BACKUP_VERSION = 1;
export const MAX_BACKUP_CHARS = 1_000_000;

export type EditorBackupMode = 'form' | 'source';

export interface BackupState {
  body: string;
  rawInner: string;
  hasFrontmatter: boolean;
  fmError: string | null;
  form: FrontmatterFormValues;
  sourceText: string;
}

export interface BackupRecord {
  version: typeof BACKUP_VERSION;
  repoKey: string;
  path: string;
  isNew: boolean;
  baseSha: string;
  mode: EditorBackupMode;
  savedAt: number;
  size: number;
  text: string;
  state: BackupState;
}

export interface BackupRepoRef {
  owner: string;
  name: string;
  defaultBranch: string;
}

export function backupRepoKey(mode: 'demo' | 'live', repo: BackupRepoRef): string {
  return `${mode}:${repo.owner}/${repo.name}@${repo.defaultBranch}`;
}

/** Prefix shared by every branch of a repo; used when clearing from settings. */
export function backupKeyPrefix(mode: 'demo' | 'live', repo: BackupRepoRef): string {
  return `${mode}:${repo.owner}/${repo.name}@`;
}

const RESERVED_FORM_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function sanitizeForm(value: unknown): FrontmatterFormValues | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const form: FrontmatterFormValues = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!key || RESERVED_FORM_KEYS.has(key)) return null;
    if (typeof item === 'string') form[key] = item;
    else if (typeof item === 'boolean') form[key] = item;
    else return null;
  }
  return form;
}

function sanitizeState(value: unknown): BackupState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const body = readString(raw.body);
  const rawInner = readString(raw.rawInner);
  const hasFrontmatter = readBoolean(raw.hasFrontmatter);
  const sourceText = readString(raw.sourceText);
  const form = sanitizeForm(raw.form);
  const fmError = raw.fmError === null ? null : readString(raw.fmError);
  if (body === null || rawInner === null || hasFrontmatter === null || sourceText === null || form === null) return null;
  if (raw.fmError !== null && fmError === null) return null;
  return { body, rawInner, hasFrontmatter, fmError, form, sourceText };
}

/**
 * IndexedDB is a trust boundary only in the sense that old/foreign records may be
 * present; validate everything and drop prototype-polluting form keys.
 */
export function isBackupRecord(value: unknown): value is BackupRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  const repoKey = readString(raw.repoKey);
  const path = readString(raw.path);
  const isNew = readBoolean(raw.isNew);
  const baseSha = readString(raw.baseSha);
  const text = readString(raw.text);
  const state = sanitizeState(raw.state);
  if (raw.version !== BACKUP_VERSION || !repoKey || !path || isNew === null || baseSha === null) return false;
  if (raw.mode !== 'form' && raw.mode !== 'source') return false;
  if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt) || raw.savedAt <= 0) return false;
  if (text === null || state === null) return false;
  if (typeof raw.size !== 'number' || raw.size !== text.length) return false;
  // Existing files must carry the blob sha they were based on; new drafts have no remote yet.
  return isNew ? baseSha === '' : baseSha !== '';
}

export interface BuildBackupTextInput {
  mode: EditorBackupMode;
  sourceText: string;
  meta: DocumentMeta;
  rawInner: string;
  body: string;
  hasFrontmatter: boolean;
  fields: readonly FrontmatterField[];
  form: FrontmatterFormValues;
  originalData: Record<string, unknown>;
}

/**
 * Compose the whole file as it would be saved, but without auto-updating
 * `updated`. Broken YAML falls back to the untouched raw block; a backup must
 * never throw while the user is typing.
 */
export function buildBackupText(input: BuildBackupTextInput): string {
  if (input.mode === 'source') return toEditingText(input.sourceText);

  let raw = input.rawInner;
  let patchKeys = 0;
  try {
    const { patch } = buildFrontmatterPatch(input.fields, input.form, input.originalData);
    patchKeys = Object.keys(patch).length;
    raw = updateFrontmatterRaw(raw, patch);
  } catch {
    // Keep the raw block as typed; the body is still worth backing up.
  }

  return toEditingText(
    composeDocument({
      meta: input.meta,
      frontmatterRaw: raw,
      body: input.body,
      includeFrontmatter: input.hasFrontmatter || patchKeys > 0,
    }),
  );
}

export interface RestoredEditorState {
  mode: EditorBackupMode;
  body: string;
  rawInner: string;
  hasFrontmatter: boolean;
  fmError: string | null;
  form: FrontmatterFormValues;
  sourceText: string;
  originalData: Record<string, unknown>;
  loadedSha: string;
}

/**
 * Restore an existing file's draft. The diff baseline is the *current* remote
 * document, while `loadedSha` stays on the backup's base sha so a changed remote
 * still surfaces as the usual 409 conflict instead of being overwritten.
 */
export function restoreToEditorState(backup: BackupRecord, remoteText: string): RestoredEditorState {
  return {
    mode: backup.mode,
    body: backup.state.body,
    rawInner: backup.state.rawInner,
    hasFrontmatter: backup.state.hasFrontmatter,
    fmError: backup.state.fmError,
    form: { ...backup.state.form },
    sourceText: backup.state.sourceText,
    originalData: parseDocument(remoteText).data,
    loadedSha: backup.baseSha,
  };
}

export function backupRemoteChanged(backup: BackupRecord, currentSha: string | null): boolean {
  return !backup.isNew && Boolean(currentSha) && backup.baseSha !== currentSha;
}

export function backupCharCount(text: string): number {
  return text.replace(/\s+/g, '').length;
}
