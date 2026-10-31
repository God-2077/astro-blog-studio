import type { RepoConfig, RepoProfile, Settings } from '@/lib/config/schema';

type RepoScopedSettings = Pick<Settings, 'repo' | 'content' | 'commit' | 'frontmatter'>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function cloneRepoProfile(profile: RepoProfile): RepoProfile {
  return {
    owner: profile.owner,
    name: profile.name,
    branch: profile.branch,
    content: clone(profile.content),
    commit: clone(profile.commit),
    frontmatter: clone(profile.frontmatter),
  };
}

/** The active repository's settings materialized into a profile snapshot. */
export function activeRepoProfile(settings: RepoScopedSettings): RepoProfile | null {
  if (!settings.repo) return null;
  return {
    owner: settings.repo.owner,
    name: settings.repo.name,
    branch: settings.repo.branch,
    content: clone(settings.content),
    commit: clone(settings.commit),
    frontmatter: clone(settings.frontmatter),
  };
}

/**
 * New repositories start from the active repository's settings, with optional
 * content overrides from the add dialog. The result is always an independent
 * deep copy so later edits cannot leak between repositories.
 */
export function profileFromSettings(
  settings: RepoScopedSettings,
  repo: RepoConfig,
  contentOverrides: Partial<RepoProfile['content']> = {},
): RepoProfile {
  return {
    owner: repo.owner,
    name: repo.name,
    branch: repo.branch,
    content: { ...clone(settings.content), ...contentOverrides },
    commit: clone(settings.commit),
    frontmatter: clone(settings.frontmatter),
  };
}

/** Active profile first, then inactive profiles in their stored order. */
export function allRepoProfiles(settings: RepoScopedSettings & Pick<Settings, 'repos'>): RepoProfile[] {
  const active = activeRepoProfile(settings);
  return active ? [active, ...settings.repos] : [...settings.repos];
}
