import type { ContentTarget } from './model';

export interface ContentDelta {
  /** In the HEAD tree but not in the cached path/sha map. */
  added: ContentTarget[];
  /** Same path, different blob sha. */
  modified: ContentTarget[];
  /** In the cache but no longer in the HEAD tree. */
  deleted: string[];
  unchanged: number;
  total: number;
}

/**
 * Path + blob sha diff between the cached file set and the current HEAD tree
 * slice. `base` only contains records that actually decrypted, so a corrupted
 * or missing record shows up as `added` and gets re-read.
 */
export function diffContent(base: ReadonlyMap<string, string>, targets: readonly ContentTarget[]): ContentDelta {
  const targetPaths = new Set<string>();
  const added: ContentTarget[] = [];
  const modified: ContentTarget[] = [];
  let unchanged = 0;

  for (const target of targets) {
    targetPaths.add(target.path);
    const baseSha = base.get(target.path);
    if (baseSha === undefined) added.push(target);
    else if (baseSha !== target.sha) modified.push(target);
    else unchanged += 1;
  }

  const deleted: string[] = [];
  for (const path of base.keys()) {
    if (!targetPaths.has(path)) deleted.push(path);
  }
  deleted.sort();

  return { added, modified, deleted, unchanged, total: targets.length };
}
