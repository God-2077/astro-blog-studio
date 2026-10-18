import picomatch from 'picomatch';

export function normalizeRepoPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
}

export function normalizeExclude(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const normalized = normalizeRepoPath(trimmed);
  return normalized || null;
}

function hasGlobMagic(value: string): boolean {
  return /[*?[\]{}]/.test(value);
}

export interface ExclusionMatcher {
  entries: string[];
  match(path: string): boolean;
  matchEntry(path: string): string | null;
}

export function createExclusionMatcher(entries: string[]): ExclusionMatcher {
  const rules = entries
    .map((entry) => normalizeExclude(entry))
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => ({
      entry,
      glob: hasGlobMagic(entry) ? picomatch(entry, { dot: true }) : null,
    }));

  const match = (path: string): boolean => {
    const normalized = normalizeRepoPath(path);
    return rules.some((rule) =>
      rule.glob ? rule.glob(normalized) : normalized === rule.entry || normalized.startsWith(`${rule.entry}/`),
    );
  };

  return {
    entries: rules.map((rule) => rule.entry),
    match,
    matchEntry: (path) => rules.find((rule) => (rule.glob ? rule.glob(path) : path === rule.entry))?.entry ?? null,
  };
}

export function isMarkdownFile(path: string, extensions: string[]): boolean {
  const lower = path.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension.toLowerCase()));
}

export function isUnderRoot(path: string, rootDir: string): boolean {
  const root = normalizeRepoPath(rootDir);
  if (!root) return true;
  return path === root || path.startsWith(`${root}/`);
}

export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function basename(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

export function withoutExtension(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
}

export function joinPath(...segments: string[]): string {
  return normalizeRepoPath(segments.filter(Boolean).join('/'));
}

export function parentFolders(path: string): string[] {
  const parts = normalizeRepoPath(path).split('/').slice(0, -1);
  const folders: string[] = [];
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    folders.push(current);
  }
  return folders;
}
