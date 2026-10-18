import { create } from 'zustand';

interface EditorGuardState {
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
}

export const useEditorGuard = create<EditorGuardState>()((set) => ({
  dirty: false,
  setDirty: (dirty) => set({ dirty }),
}));
