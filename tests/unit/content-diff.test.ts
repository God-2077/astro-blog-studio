import { describe, expect, it } from 'vitest';
import { diffContent } from '@/lib/content/diff';
import type { ContentTarget } from '@/lib/content/model';

function target(path: string, sha: string): ContentTarget {
  return { path, sha };
}

describe('diffContent', () => {
  it('classifies added / modified / deleted / unchanged by path and blob sha', () => {
    const base = new Map([
      ['src/a.md', 'sha-a'],
      ['src/b.md', 'sha-b'],
      ['src/c.md', 'sha-c'],
    ]);
    const targets = [target('src/a.md', 'sha-a'), target('src/b.md', 'sha-b2'), target('src/d.md', 'sha-d')];

    const delta = diffContent(base, targets);

    expect(delta.added.map((entry) => entry.path)).toEqual(['src/d.md']);
    expect(delta.modified.map((entry) => entry.path)).toEqual(['src/b.md']);
    expect(delta.deleted).toEqual(['src/c.md']);
    expect(delta.unchanged).toBe(1);
    expect(delta.total).toBe(3);
  });

  it('treats an empty base as a full first load', () => {
    const delta = diffContent(new Map(), [target('a.md', '1'), target('b.md', '2')]);
    expect(delta.added).toHaveLength(2);
    expect(delta.modified).toHaveLength(0);
    expect(delta.deleted).toHaveLength(0);
    expect(delta.unchanged).toBe(0);
  });

  it('treats an empty target list as deleting everything and sorts the list', () => {
    const delta = diffContent(
      new Map([
        ['z.md', '1'],
        ['a.md', '2'],
      ]),
      [],
    );
    expect(delta.deleted).toEqual(['a.md', 'z.md']);
    expect(delta.total).toBe(0);
  });

  it('keeps untouched paths out of added and modified', () => {
    const base = new Map([
      ['a.md', '1'],
      ['b.md', '2'],
    ]);
    const delta = diffContent(base, [target('a.md', '1'), target('b.md', '2')]);
    expect(delta.added).toHaveLength(0);
    expect(delta.modified).toHaveLength(0);
    expect(delta.deleted).toHaveLength(0);
    expect(delta.unchanged).toBe(2);
  });
});
