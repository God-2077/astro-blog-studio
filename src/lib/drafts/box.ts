import type { BackupRecord } from '@/lib/backup/model';
import { normalizeRepoPath } from '@/lib/paths/paths';
import { type DraftRecord, draftFromBackup } from './model';

/**
 * The draft box is the union of explicit drafts and crash-recovery backups:
 * an autosave backup is still a draft the user has not committed. One path has
 * at most one row; the newer copy wins so opening it never loses the latest
 * typing.
 */
export interface DraftBoxItem extends DraftRecord {
  origin: 'draft' | 'backup';
}

export function mergeDraftBox(repoKey: string, drafts: DraftRecord[], backups: BackupRecord[]): DraftBoxItem[] {
  const byPath = new Map<string, DraftBoxItem>();

  for (const draft of drafts) {
    if (draft.repoKey !== repoKey) continue;
    byPath.set(normalizeRepoPath(draft.path), { ...draft, origin: 'draft' });
  }

  for (const backup of backups) {
    if (backup.repoKey !== repoKey) continue;
    const key = normalizeRepoPath(backup.path);
    const current = byPath.get(key);
    if (current && current.savedAt >= backup.savedAt) continue;
    byPath.set(key, { ...draftFromBackup(backup), origin: 'backup' });
  }

  return [...byPath.values()].sort((a, b) => b.savedAt - a.savedAt);
}
