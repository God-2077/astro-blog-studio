export interface ParsedRepo {
  owner: string;
  name: string;
}

export function parseRepoInput(input: string): ParsedRepo | null {
  const value = input.trim();
  if (!value) return null;

  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(value);
  if (ssh?.[1] && ssh[2]) return { owner: ssh[1], name: ssh[2] };

  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?(?:[/?#].*)?$/i.exec(value);
  if (url?.[1] && url[2]) return { owner: url[1], name: url[2] };

  const short = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value);
  if (short?.[1] && short[2]) return { owner: short[1], name: short[2] };

  return null;
}

export function repoSlug(repo: ParsedRepo | null): string {
  return repo ? `${repo.owner}/${repo.name}` : '';
}
