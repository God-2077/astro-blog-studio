import { create } from 'zustand';
import { listBackups, removeBackup } from '@/lib/backup/store';
import { type DraftBoxItem, mergeDraftBox } from '@/lib/drafts/box';
import type { DraftRecord } from '@/lib/drafts/model';
import { listDrafts, removeDraft } from '@/lib/drafts/store';
import { normalizeRepoPath } from '@/lib/paths/paths';

export type DraftsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface DraftsState {
  repoKey: string | null;
  status: DraftsStatus;
  items: DraftBoxItem[];
  error: string | null;
  /** Read explicit drafts plus autosave backups for one repository/branch. */
  load: (repoKey: string) => Promise<void>;
  /** Remove every local copy (explicit draft and autosave backup) for a path. */
  remove: (repoKey: string, path: string) => Promise<void>;
  /** Reflect a draft saved by the editor without re-reading IndexedDB. */
  remember: (draft: DraftRecord) => void;
  /** Drop one row after it was committed, moved or deleted. */
  forget: (repoKey: string, path: string) => void;
  reset: () => void;
}

let epoch = 0;

function sortItems(items: DraftBoxItem[]): DraftBoxItem[] {
  return [...items].sort((a, b) => b.savedAt - a.savedAt);
}

export const useDrafts = create<DraftsState>()((set) => ({
  repoKey: null,
  status: 'idle',
  items: [],
  error: null,

  load: async (repoKey) => {
    epoch += 1;
    const run = epoch;
    set({ repoKey, status: 'loading', error: null });
    try {
      const [drafts, backups] = await Promise.all([listDrafts(repoKey), listBackups(repoKey)]);
      if (epoch !== run) return;
      set({ items: mergeDraftBox(repoKey, drafts, backups), status: 'ready' });
    } catch {
      if (epoch !== run) return;
      set({ status: 'error', error: '读取本机草稿箱失败。' });
    }
  },

  remove: async (repoKey, path) => {
    await Promise.all([removeDraft(repoKey, path), removeBackup(repoKey, path)]);
    set((state) => ({
      items: state.items.filter(
        (record) => !(record.repoKey === repoKey && normalizeRepoPath(record.path) === normalizeRepoPath(path)),
      ),
    }));
  },

  remember: (draft) => {
    set((state) => {
      if (state.repoKey && state.repoKey !== draft.repoKey) return state;
      const others = state.items.filter(
        (record) => !(record.repoKey === draft.repoKey && normalizeRepoPath(record.path) === normalizeRepoPath(draft.path)),
      );
      return {
        repoKey: state.repoKey ?? draft.repoKey,
        status: 'ready',
        error: null,
        items: sortItems([...others, { ...draft, origin: 'draft' }]),
      };
    });
  },

  forget: (repoKey, path) => {
    set((state) => ({
      items: state.items.filter(
        (record) => !(record.repoKey === repoKey && normalizeRepoPath(record.path) === normalizeRepoPath(path)),
      ),
    }));
  },

  reset: () => {
    epoch += 1;
    set({ repoKey: null, status: 'idle', items: [], error: null });
  },
}));
