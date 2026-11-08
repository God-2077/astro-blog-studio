import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/config/defaults';
import type { RepoProfile } from '@/lib/config/schema';
import { repoProfileKey } from '@/lib/repos/identity';
import { useSettings } from '@/stores/settings';

const repoA = { owner: 'God-2077', name: 'astro-blog-content', branch: 'main' };
const repoB = { owner: 'God-2077', name: 'astro-blog-content-notes', branch: 'main' };

function profileOf(repo: typeof repoA, overrides: { rootDir?: string; create?: string } = {}): RepoProfile {
  return {
    ...repo,
    content: { ...structuredClone(defaultSettings.content), rootDir: overrides.rootDir ?? 'src' },
    commit: { ...structuredClone(defaultSettings.commit), create: overrides.create ?? defaultSettings.commit.create },
    frontmatter: structuredClone(defaultSettings.frontmatter),
  };
}

function resetStore(): void {
  useSettings.setState({ ...structuredClone(defaultSettings), repos: [] });
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

afterEach(() => {
  resetStore();
  localStorage.clear();
});

describe('settings repository actions', () => {
  it('starts a workspace and clears any previous inactive profiles', () => {
    useSettings.getState().addRepo(profileOf(repoB));
    expect(useSettings.getState().repos).toHaveLength(1);

    useSettings.getState().startWorkspace(profileOf(repoA, { rootDir: 'content' }));

    const state = useSettings.getState();
    expect(state.repo).toEqual(repoA);
    expect(state.repos).toEqual([]);
    expect(state.content.rootDir).toBe('content');
  });

  it('archives the active configuration and restores it when switching back', () => {
    useSettings.getState().startWorkspace(profileOf(repoA, { rootDir: 'a-root', create: 'a: {title}' }));
    useSettings.getState().addRepo(profileOf(repoB, { rootDir: 'b-root', create: 'b: {title}' }));

    expect(useSettings.getState().activateRepo(repoProfileKey(repoB))).toBe(true);
    let state = useSettings.getState();
    expect(state.repo).toEqual(repoB);
    expect(state.content.rootDir).toBe('b-root');
    expect(state.commit.create).toBe('b: {title}');
    expect(state.repos.map((profile) => repoProfileKey(profile))).toEqual([repoProfileKey(repoA)]);

    // Editing the active repository must not mutate the archived A profile.
    useSettings.getState().patch({ content: { ...state.content, rootDir: 'b-root-edited' } });
    expect(useSettings.getState().activateRepo(repoProfileKey(repoA))).toBe(true);
    state = useSettings.getState();
    expect(state.repo).toEqual(repoA);
    expect(state.content.rootDir).toBe('a-root');
    expect(state.commit.create).toBe('a: {title}');
    expect(state.repos.map((profile) => profile.content.rootDir)).toEqual(['b-root-edited']);
  });

  it('rejects duplicate profiles but allows another branch of the same repository', () => {
    useSettings.getState().startWorkspace(profileOf(repoA));
    expect(useSettings.getState().addRepo(profileOf({ ...repoA, owner: 'god-2077' }))).toBe(false);
    expect(useSettings.getState().addRepo(profileOf(repoB))).toBe(true);
    expect(useSettings.getState().addRepo(profileOf({ ...repoA, branch: 'dev' }))).toBe(true);
    expect(useSettings.getState().repos).toHaveLength(2);
  });

  it('removes only inactive profiles and leaves the active one alone', () => {
    useSettings.getState().startWorkspace(profileOf(repoA));
    const inactive = profileOf(repoB);
    useSettings.getState().addRepo(inactive);

    expect(useSettings.getState().removeRepo(repoProfileKey(repoA))).toBeNull();
    expect(useSettings.getState().removeRepo(repoProfileKey(repoB))).toMatchObject({ name: repoB.name });
    expect(useSettings.getState().repos).toHaveLength(0);
    expect(useSettings.getState().repo).toEqual(repoA);
  });

  it('replaces the whole snapshot on import and drops duplicate active profiles', () => {
    useSettings.getState().startWorkspace(profileOf(repoA, { rootDir: 'old-a', create: 'old: {title}' }));
    useSettings.getState().addRepo(profileOf(repoB));

    const imported = {
      ...structuredClone(defaultSettings),
      repo: repoA,
      repos: [
        profileOf(repoB, { rootDir: 'imported-b', create: 'imported-b: {title}' }),
        profileOf({ ...repoA, branch: 'dev' }, { rootDir: 'imported-a-dev' }),
        profileOf(repoA),
      ],
      content: { ...structuredClone(defaultSettings.content), rootDir: 'imported-a' },
      commit: { ...structuredClone(defaultSettings.commit), create: 'imported-a: {title}' },
      appearance: { ...structuredClone(defaultSettings.appearance), locale: 'ja' as const },
    };

    useSettings.getState().replaceFromImport(imported);

    const state = useSettings.getState();
    expect(state.repo).toEqual(repoA);
    expect(state.content.rootDir).toBe('imported-a');
    expect(state.commit.create).toBe('imported-a: {title}');
    expect(state.appearance.locale).toBe('ja');
    expect(state.repos.map((item) => `${item.name}@${item.branch}`)).toEqual([
      'astro-blog-content-notes@main',
      'astro-blog-content@dev',
    ]);
    expect(state.repos[0]?.content.rootDir).toBe('imported-b');
    expect(typeof state.patch).toBe('function');
  });

  it('clears the repository list while keeping the active config as setup defaults', () => {
    useSettings.getState().startWorkspace(profileOf(repoA, { rootDir: 'kept-root', create: 'kept: {title}' }));
    useSettings.getState().addRepo(profileOf(repoB));

    useSettings.getState().clearRepos();

    const state = useSettings.getState();
    expect(state.repo).toBeNull();
    expect(state.repos).toEqual([]);
    expect(state.content.rootDir).toBe('kept-root');
    expect(state.commit.create).toBe('kept: {title}');
  });
});
