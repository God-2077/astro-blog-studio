import { create } from 'zustand';

export interface LastCommit {
  sha: string;
  message: string;
  path: string;
  at: number;
  htmlUrl?: string;
}

interface LastCommitState {
  commit: LastCommit | null;
  setCommit: (commit: LastCommit) => void;
  clear: () => void;
}

export const useLastCommit = create<LastCommitState>()((set) => ({
  commit: null,
  setCommit: (commit) => set({ commit }),
  clear: () => set({ commit: null }),
}));
