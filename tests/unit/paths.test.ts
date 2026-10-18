import { describe, expect, it } from 'vitest';
import { findUnknownPlaceholders, renderCommitMessage } from '@/lib/paths/commit-message';
import { createExclusionMatcher, isMarkdownFile, isUnderRoot, normalizeRepoPath } from '@/lib/paths/paths';
import { buildTreeModel } from '@/lib/tree/model';

describe('paths and exclusions', () => {
  it('normalizes repo paths', () => {
    expect(normalizeRepoPath('./src\\content//blog/')).toBe('src/content/blog');
    expect(normalizeRepoPath('/src/content/')).toBe('src/content');
  });

  it('matches directory prefixes and globs', () => {
    const matcher = createExclusionMatcher(['src/content/blog/en', 'src/pages/*.md']);
    expect(matcher.match('src/content/blog/en/hello.md')).toBe(true);
    expect(matcher.match('src/content/blog/en')).toBe(true);
    expect(matcher.match('src/content/blog/en2/hello.md')).toBe(false);
    expect(matcher.match('src/pages/about.md')).toBe(true);
    expect(matcher.match('src/pages/about.txt')).toBe(false);
  });

  it('checks extensions and root boundaries', () => {
    expect(isMarkdownFile('a/b.md', ['.md', '.mdx'])).toBe(true);
    expect(isMarkdownFile('a/b.mdx', ['.md', '.mdx'])).toBe(true);
    expect(isMarkdownFile('a/b.txt', ['.md'])).toBe(false);
    expect(isUnderRoot('src/content/blog/a.md', 'src')).toBe(true);
    expect(isUnderRoot('src', 'src')).toBe(true);
    expect(isUnderRoot('public/a.md', 'src')).toBe(false);
    expect(isUnderRoot('srcx/a.md', 'src')).toBe(false);
  });

  it('builds a tree with visible files and excluded counts', () => {
    const model = buildTreeModel(
      [
        { path: 'src/content/blog/note/a.md', sha: 'a' },
        { path: 'src/content/blog/note/b.md', sha: 'b' },
        { path: 'src/content/blog/en/a.md', sha: 'c' },
        { path: 'src/pages/about.md', sha: 'd' },
        { path: 'public/readme.md', sha: 'e' },
      ],
      { rootDir: 'src', extensions: ['.md'], excludes: ['src/content/blog/en'] },
    );
    expect(model.files.map((file) => file.path)).toEqual([
      'src/content/blog/note/a.md',
      'src/content/blog/note/b.md',
      'src/pages/about.md',
    ]);
    expect(model.totalMarkdown).toBe(3);
    expect(model.excludedCount).toBe(1);
    expect(model.nodes.map((node) => node.name)).toEqual(['content', 'pages']);
  });
});

describe('commit messages', () => {
  it('renders placeholders', () => {
    expect(
      renderCommitMessage('update: {path} ({name} in {dir}) at {date}', {
        path: 'src/content/blog/note/a.md',
        action: 'update',
        date: '2026-01-01',
      }),
    ).toBe('update: src/content/blog/note/a.md (a in src/content/blog/note) at 2026-01-01');
  });

  it('supports move placeholders and unknown placeholder warnings', () => {
    expect(
      renderCommitMessage('move {oldPath} → {newPath}', {
        path: 'x',
        oldPath: 'a.md',
        newPath: 'b.md',
        action: 'move',
        date: '2026-01-01',
      }),
    ).toBe('move a.md → b.md');
    expect(findUnknownPlaceholders('x {nope} {path}')).toEqual(['nope']);
  });

  it('falls back when the template is empty', () => {
    expect(renderCommitMessage('  ', { path: 'a.md', action: 'create', date: '2026-01-01' })).toBe('create: a.md');
  });
});
