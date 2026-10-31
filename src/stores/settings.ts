import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultSettings } from '@/lib/config/defaults';
import { type RepoConfig, type RepoProfile, type Settings, settingsSchema } from '@/lib/config/schema';
import { repoProfileKey } from '@/lib/repos/identity';
import { activeRepoProfile, cloneRepoProfile } from '@/lib/repos/profile';

type SettingsPatch = Partial<Omit<Settings, 'version'>>;

interface SettingsState extends Settings {
  /** First-run / recovered setup: make this the only active repository. */
  startWorkspace: (profile: RepoProfile) => void;
  /** Store an inactive repository. Returns false for a duplicate profile. */
  addRepo: (profile: RepoProfile) => boolean;
  /** Archive the active settings and restore the target inactive profile. */
  activateRepo: (key: string) => boolean;
  /** Remove an inactive profile and return it (used to clean its token). */
  removeRepo: (key: string) => RepoProfile | null;
  /** Disconnect every repository but keep the active config as setup defaults. */
  clearRepos: () => void;
  patch: (patch: SettingsPatch) => void;
  reset: () => void;
}

function sanitizeRepos(repo: RepoConfig | null, repos: RepoProfile[]): RepoProfile[] {
  const seen = new Set<string>();
  if (repo) seen.add(repoProfileKey(repo));
  return repos.filter((profile) => {
    const key = repoProfileKey(profile);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      startWorkspace: (profile) =>
        set({
          repo: { owner: profile.owner, name: profile.name, branch: profile.branch },
          repos: [],
          content: structuredClone(profile.content),
          commit: structuredClone(profile.commit),
          frontmatter: structuredClone(profile.frontmatter),
        }),
      addRepo: (profile) => {
        const state = get();
        const key = repoProfileKey(profile);
        if (state.repo && repoProfileKey(state.repo) === key) return false;
        if (state.repos.some((item) => repoProfileKey(item) === key)) return false;
        set((current) => ({ repos: [...current.repos, cloneRepoProfile(profile)] }));
        return true;
      },
      activateRepo: (key) => {
        const state = get();
        const target = state.repos.find((profile) => repoProfileKey(profile) === key);
        if (!target) return false;
        if (state.repo && repoProfileKey(state.repo) === key) return false;
        const current = activeRepoProfile(state);
        const remaining = state.repos.filter((profile) => repoProfileKey(profile) !== key);
        set({
          repo: { owner: target.owner, name: target.name, branch: target.branch },
          content: structuredClone(target.content),
          commit: structuredClone(target.commit),
          frontmatter: structuredClone(target.frontmatter),
          repos: current ? [...remaining, current] : remaining,
        });
        return true;
      },
      removeRepo: (key) => {
        const state = get();
        const target = state.repos.find((profile) => repoProfileKey(profile) === key);
        if (!target) return null;
        set({ repos: state.repos.filter((profile) => repoProfileKey(profile) !== key) });
        return cloneRepoProfile(target);
      },
      clearRepos: () => set({ repo: null, repos: [] }),
      patch: (patch) => set((state) => ({ ...state, ...patch })),
      reset: () => set({ ...defaultSettings, repos: [] }),
    }),
    {
      name: 'abs.settings.v1',
      version: 1,
      merge: (persisted, current) => {
        const parsed = settingsSchema.safeParse(persisted);
        if (!parsed.success) return current;
        return { ...current, ...parsed.data, repos: sanitizeRepos(parsed.data.repo, parsed.data.repos) };
      },
    },
  ),
);
