import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/config/defaults';
import type { RepoProfile, Settings } from '@/lib/config/schema';
import { repoProfileKey, repoTokenKey } from '@/lib/repos/identity';
import { activeRepoProfile, allRepoProfiles, cloneRepoProfile, profileFromSettings } from '@/lib/repos/profile';

const repo = { owner: 'God-2077', name: 'astro-blog-content', branch: 'main' };
const otherRepo = { owner: 'God-2077', name: 'astro-blog-content-notes', branch: 'dev' };

function profileOf(repoConfig: typeof repo): RepoProfile {
  return {
    ...repoConfig,
    content: structuredClone(defaultSettings.content),
    commit: structuredClone(defaultSettings.commit),
    frontmatter: structuredClone(defaultSettings.frontmatter),
  };
}

function settingsWithActive(): Settings {
  return {
    ...structuredClone(defaultSettings),
    repo,
    content: { ...structuredClone(defaultSettings.content), rootDir: 'content', excludes: ['draft'] },
    commit: { ...structuredClone(defaultSettings.commit), create: 'create: {title}' },
    frontmatter: { fields: [{ name: 'title', type: 'string', required: true }] },
  };
}

describe('repository identity', () => {
  it('normalizes owner/name but keeps the branch exact', () => {
    expect(repoProfileKey({ owner: 'God-2077', name: 'Astro-Blog', branch: 'Feature/Test' })).toBe(
      'god-2077/astro-blog@Feature/Test',
    );
    expect(repoTokenKey({ owner: 'God-2077', name: 'Astro-Blog' })).toBe('god-2077/astro-blog');
  });
});

describe('repository profiles', () => {
  it('materializes the active top-level settings into a profile', () => {
    const settings = settingsWithActive();
    const active = activeRepoProfile(settings);
    expect(active).toMatchObject({ owner: repo.owner, name: repo.name, branch: repo.branch });
    expect(active?.content.rootDir).toBe('content');
    expect(active?.commit.create).toBe('create: {title}');
    expect(active?.frontmatter.fields).toEqual([{ name: 'title', type: 'string', required: true }]);
    expect(activeRepoProfile({ ...settings, repo: null })).toBeNull();
  });

  it('builds an independent profile from the active settings with content overrides', () => {
    const settings = settingsWithActive();
    const profile = profileFromSettings(settings, { ...otherRepo, branch: 'main' }, { rootDir: 'src', excludes: ['en'] });

    expect(profile.content.rootDir).toBe('src');
    expect(profile.content.excludes).toEqual(['en']);
    expect(profile.content.extensions).toEqual(defaultSettings.content.extensions);
    expect(profile.commit.create).toBe('create: {title}');
    expect(profile.frontmatter.fields).toHaveLength(1);

    profile.content.extensions.push('.txt');
    const firstField = profile.frontmatter.fields[0];
    if (firstField) firstField.required = false;
    expect(settings.content.extensions).not.toContain('.txt');
    expect(settings.frontmatter.fields[0]?.required).toBe(true);
  });

  it('clones profiles and lists the active profile first', () => {
    const settings = settingsWithActive();
    const inactive = profileOf(otherRepo);
    const list = allRepoProfiles({ ...settings, repos: [inactive] });

    expect(list.map((item) => item.name)).toEqual([repo.name, otherRepo.name]);
    const cloned = cloneRepoProfile(inactive);
    cloned.commit.create = 'changed';
    cloned.content.excludes.push('changed');
    expect(inactive.commit.create).toBe(defaultSettings.commit.create);
    expect(inactive.content.excludes).toEqual([]);
  });
});
