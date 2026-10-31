export interface RepoIdentity {
  owner: string;
  name: string;
  branch: string;
}

export interface RepoTokenIdentity {
  owner: string;
  name: string;
}

function normalizedSlug(repo: RepoTokenIdentity): string {
  return `${repo.owner.trim().toLowerCase()}/${repo.name.trim().toLowerCase()}`;
}

/**
 * Identity for a saved repository profile. GitHub owner/repository names are
 * case-insensitive, so normalize those but keep the branch exactly as entered.
 */
export function repoProfileKey(repo: RepoIdentity): string {
  return `${normalizedSlug(repo)}@${repo.branch}`;
}

/**
 * PATs belong to a repository, not a branch: every branch profile of the same
 * repository shares one encrypted token.
 */
export function repoTokenKey(repo: RepoTokenIdentity): string {
  return normalizedSlug(repo);
}
