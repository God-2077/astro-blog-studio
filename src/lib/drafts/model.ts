import { BACKUP_VERSION, type BackupRecord, type BackupState, type EditorBackupMode, isBackupRecord } from '@/lib/backup/model';
import { type FrontmatterField, formValuesFromData } from '@/lib/frontmatter/fields';
import { t } from '@/lib/i18n';
import { parseDocument, toEditingText } from '@/lib/markdown/document';
import { isMarkdownDocument, normalizeRepoPath } from '@/lib/paths/paths';

export const DRAFT_VERSION = 1;
export const MAX_DRAFT_CHARS = 1_000_000;

/**
 * An explicitly saved draft. It carries the same restore state as a crash
 * backup, so opening it from the draft box restores the exact editor session
 * (form vs source mode, raw YAML and the diff baseline sha), not just text.
 */
export interface DraftRecord {
  version: typeof DRAFT_VERSION;
  repoKey: string;
  path: string;
  title: string;
  isNew: boolean;
  baseSha: string;
  mode: EditorBackupMode;
  savedAt: number;
  size: number;
  text: string;
  state: BackupState;
}

/** Drafts use the backup record shape plus a display title; validation is shared. */
export function isDraftRecord(value: unknown): value is DraftRecord {
  if (!isBackupRecord(value)) return false;
  const title = (value as { title?: unknown }).title;
  return typeof title === 'string';
}

/** Reuse the editor's restore path without duplicating its state mapping. */
export function draftToBackup(draft: DraftRecord): BackupRecord {
  return {
    version: BACKUP_VERSION,
    repoKey: draft.repoKey,
    path: draft.path,
    isNew: draft.isNew,
    baseSha: draft.baseSha,
    mode: draft.mode,
    savedAt: draft.savedAt,
    size: draft.size,
    text: draft.text,
    state: draft.state,
  };
}

export function draftTitle(value: unknown, path: string): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (title) return title;
  const fileName = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  return fileName || t('common.untitled');
}

export interface DraftFromTextInput {
  repoKey: string;
  path: string;
  text: string;
  fields: readonly FrontmatterField[];
  isNew?: boolean;
  baseSha?: string;
  savedAt?: number;
}

/**
 * Snapshot a document (e.g. a new post that only lived in memory) as a draft.
 * The diff baseline is the document itself, so restoring it and saving again
 * patches only the fields the user changes afterwards. Non-Markdown paths are
 * stored as whole-file source text instead of being parsed as frontmatter.
 */
export function draftFromText(input: DraftFromTextInput): DraftRecord {
  const markdown = isMarkdownDocument(input.path);
  const parsed = markdown ? parseDocument(input.text) : null;
  const sourceText = toEditingText(input.text);
  const savedAt = input.savedAt ?? Date.now();
  return {
    version: DRAFT_VERSION,
    repoKey: input.repoKey,
    path: normalizeRepoPath(input.path),
    title: draftTitle(parsed?.data.title, input.path),
    // A record without a base sha has no remote file yet; default it to a new
    // draft so it can never be written in an invalid shape.
    isNew: input.isNew ?? !input.baseSha,
    baseSha: input.baseSha ?? '',
    mode: markdown ? 'form' : 'source',
    savedAt,
    size: input.text.length,
    text: input.text,
    state: markdown
      ? {
          body: parsed?.body.replace(/\r\n?/g, '\n') ?? '',
          rawInner: parsed?.frontmatterRaw ?? '',
          hasFrontmatter: parsed?.hasFrontmatter ?? false,
          fmError: parsed?.frontmatterError ?? null,
          form: formValuesFromData(input.fields, parsed?.data ?? {}),
          sourceText,
        }
      : {
          body: sourceText,
          rawInner: '',
          hasFrontmatter: false,
          fmError: null,
          form: {},
          sourceText,
        },
  };
}

/** Promote a crash backup (which may be newer than the memory draft) to a draft. */
export function draftFromBackup(backup: BackupRecord): DraftRecord {
  const markdown = isMarkdownDocument(backup.path);
  return {
    version: DRAFT_VERSION,
    repoKey: backup.repoKey,
    path: normalizeRepoPath(backup.path),
    title: draftTitle(markdown ? parseDocument(backup.text).data.title : undefined, backup.path),
    isNew: backup.isNew,
    baseSha: backup.baseSha,
    mode: markdown ? backup.mode : 'source',
    savedAt: backup.savedAt,
    size: backup.size,
    text: backup.text,
    state: backup.state,
  };
}

/** Non-whitespace character count for the draft list. */
export function draftCharCount(text: string): number {
  return text.replace(/\s+/g, '').length;
}
