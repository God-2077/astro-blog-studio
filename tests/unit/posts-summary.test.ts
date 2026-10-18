import { describe, expect, it } from 'vitest';
import { type PostSummary, pickRecent, planIndex, postRecencyMs } from '@/lib/posts/summary';

function makePost(path: string, date: string, updated?: string): PostSummary {
  return {
    path,
    title: path,
    date,
    ...(updated ? { updated } : {}),
    categories: [],
    tags: [],
    draft: false,
    sticky: false,
    encrypted: false,
    frontmatterError: false,
    bodyLength: 0,
  };
}

function isoDay(offset: number): string {
  return new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
}

describe('postRecencyMs', () => {
  it('parses the formats the studio writes', () => {
    expect(postRecencyMs('2026-10-17')).toBe(Date.UTC(2026, 9, 17));
    expect(postRecencyMs('2026-10-17 23:48:00')).toBe(Date.UTC(2026, 9, 17, 23, 48, 0));
    expect(postRecencyMs('2026/10/17 08:05')).toBe(Date.UTC(2026, 9, 17, 8, 5));
  });

  it('defers zoned ISO strings to Date.parse', () => {
    expect(postRecencyMs('2026-10-17T23:48:00+08:00')).toBe(Date.UTC(2026, 9, 17, 15, 48, 0));
  });

  it('returns NaN for empty or unreadable values', () => {
    expect(postRecencyMs(undefined)).toBeNaN();
    expect(postRecencyMs('')).toBeNaN();
    expect(postRecencyMs('待定')).toBeNaN();
  });
});

describe('pickRecent', () => {
  it('sorts the whole corpus before slicing', () => {
    // Path order is the reverse of recency, so a path-slice-then-sort would
    // return the twelve oldest posts. That was the dashboard bug.
    const posts = Array.from({ length: 200 }, (_, index) =>
      makePost(`post/${String(index).padStart(3, '0')}.md`, isoDay(index)),
    );
    const recent = pickRecent(posts, 12);

    expect(recent).toHaveLength(12);
    expect(recent[0]?.path).toBe('post/199.md');
    expect(recent[11]?.path).toBe('post/188.md');
    for (const post of recent) {
      const index = Number(post.path.slice('post/'.length, -'.md'.length));
      expect(index).toBeGreaterThanOrEqual(188);
    }
  });

  it('prefers updated over date', () => {
    const oldDateNewUpdate = makePost('a.md', '2020-01-01', '2026-12-31');
    const recentDate = makePost('b.md', '2026-06-01');
    expect(pickRecent([recentDate, oldDateNewUpdate], 2).map((post) => post.path)).toEqual(['a.md', 'b.md']);
  });

  it('keeps undated posts last and stable', () => {
    const dated = makePost('b.md', '2026-01-01');
    const undatedA = makePost('a.md', '');
    const undatedC = makePost('c.md', '');
    expect(pickRecent([undatedA, dated, undatedC], 3).map((post) => post.path)).toEqual(['b.md', 'a.md', 'c.md']);
  });

  it('breaks ties by path', () => {
    const first = makePost('a.md', '2026-01-01');
    const second = makePost('b.md', '2026-01-01');
    expect(pickRecent([second, first], 2).map((post) => post.path)).toEqual(['a.md', 'b.md']);
  });

  it('does not mutate the input order', () => {
    const posts = [makePost('old.md', '2020-01-01'), makePost('new.md', '2026-01-01')];
    pickRecent(posts, 2);
    expect(posts.map((post) => post.path)).toEqual(['old.md', 'new.md']);
  });
});

describe('planIndex', () => {
  const entries = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ path: `p${String(index).padStart(4, '0')}.md`, sha: `s${index}` }));

  it('splits into batches of 20', () => {
    const plan = planIndex(entries(25));
    expect(plan.total).toBe(25);
    expect(plan.indexed).toBe(25);
    expect(plan.chunks.map((chunk) => chunk.length)).toEqual([20, 5]);
  });

  it('handles exact multiples and empty input', () => {
    expect(planIndex(entries(40)).chunks.map((chunk) => chunk.length)).toEqual([20, 20]);
    expect(planIndex([])).toEqual({ chunks: [], total: 0, indexed: 0 });
  });

  it('caps the indexed count without lying about the total', () => {
    const plan = planIndex(entries(1200), 20, 1000);
    expect(plan.total).toBe(1200);
    expect(plan.indexed).toBe(1000);
    expect(plan.chunks).toHaveLength(50);
    expect(plan.chunks.flat()).toHaveLength(1000);
  });
});
