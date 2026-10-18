import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultSettings } from '@/lib/config/defaults';
import { type RepoConfig, type Settings, settingsSchema } from '@/lib/config/schema';

type SettingsPatch = Partial<Omit<Settings, 'version'>>;

interface SettingsState extends Settings {
  setRepo: (repo: RepoConfig | null) => void;
  patch: (patch: SettingsPatch) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setRepo: (repo) => set({ repo }),
      patch: (patch) => set((state) => ({ ...state, ...patch })),
      reset: () => set({ ...defaultSettings }),
    }),
    {
      name: 'abs.settings.v1',
      version: 1,
      merge: (persisted, current) => {
        const parsed = settingsSchema.safeParse(persisted);
        if (!parsed.success) return current;
        return { ...current, ...parsed.data };
      },
    },
  ),
);

export function repoKey(repo: RepoConfig | null): string {
  return repo ? `${repo.owner}/${repo.name}@${repo.branch}` : 'no-repo';
}
