import { create } from 'zustand';

export interface PendingPost {
  path: string;
  text: string;
}

interface PendingPostState {
  draft: PendingPost | null;
  setDraft: (draft: PendingPost) => void;
  clearDraft: () => void;
}

/**
 * New articles are drafted locally first; the first save creates the file with
 * one GitHub API call. This store itself is intentionally memory-only — the
 * editor separately keeps a local IndexedDB backup so a refresh can recover the
 * draft — and the editor shows a clear "draft lost" state when neither copy
 * exists, instead of writing a half-created file.
 */
export const usePendingPost = create<PendingPostState>()((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: null }),
}));
