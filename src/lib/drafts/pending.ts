import { readBackup } from '@/lib/backup/store';
import type { FrontmatterField } from '@/lib/frontmatter/fields';
import { normalizeRepoPath } from '@/lib/paths/paths';
import { type DraftRecord, draftFromBackup, draftFromText } from './model';
import { readDraft } from './store';

export interface CapturePendingDraftInput {
  repoKey: string;
  fields: readonly FrontmatterField[];
  pending: { path: string; text: string };
}

/**
 * Turn an in-memory new-post draft into a draft-box record without losing the
 * user's latest typing. `usePendingPost` only holds the initial document, while
 * the debounced editor backup holds the real state; prefer the backup when it
 * belongs to the same new file.
 */
export async function capturePendingDraft(input: CapturePendingDraftInput): Promise<DraftRecord> {
  const pendingPath = normalizeRepoPath(input.pending.path);
  const backup = await readBackup(input.repoKey, pendingPath).catch(() => null);
  if (backup?.isNew && normalizeRepoPath(backup.path) === pendingPath) {
    return draftFromBackup(backup);
  }
  // Without a backup the memory draft only holds the initial document, which
  // may be older than an explicit draft already in the box (e.g. autosave is
  // disabled). Keep the richer copy instead of regressing it.
  const existing = await readDraft(input.repoKey, pendingPath);
  if (existing?.isNew) return existing;
  return draftFromText({
    repoKey: input.repoKey,
    path: pendingPath,
    text: input.pending.text,
    fields: input.fields,
    isNew: true,
    baseSha: '',
  });
}
