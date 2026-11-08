import { describe, expect, it } from 'vitest';
import { findUnknownPlaceholders, renderCommitMessage, resolveCommitTitle } from '@/lib/paths/commit-message';
import {
  createExclusionMatcher,
  isMarkdownDocument,
  isMarkdownFile,
  isUnderRoot,
  normalizeRepoPath,
} from '@/lib/paths/paths';
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
    expect(isMarkdownDocument('a/b.md')).toBe(true);
    expect(isMarkdownDocument('a/b.MDX')).toBe(true);
    expect(isMarkdownDocument('a/b.txt')).toBe(false);
    expect(isMarkdownDocument('a/b.ts')).toBe(false);
    expect(isMarkdownDocument('a/b.md.txt')).toBe(false);
    expect(isUnderRoot('src/content/blog/a.md', 'src')).toBe(true);
    expect(isUnderRoot('src', 'src')).toBe(true);
    expect(isUnderRoot('public/a.md', 'src')).toBe(false);
    expect(isUnderRoot('srcx/a.md', 'src')).toBe(false);
  });

  it('builds a tree with visible files and excluded counts', () => {
    const entries = [
      { path: 'src/content/blog/note/a.md', sha: 'a' },
      { path: 'src/content/blog/note/b.md', sha: 'b' },
      { path: 'src/content/blog/en/a.md', sha: 'c' },
      { path: 'src/pages/about.md', sha: 'd' },
      { path: 'public/readme.md', sha: 'e' },
    ];
    const config = { rootDir: 'src', extensions: ['.md'], excludes: ['src/content/blog/en'] };
    const model = buildTreeModel(entries, config);
    expect(model.files.map((file) => file.path)).toEqual([
      'src/content/blog/note/a.md',
      'src/content/blog/note/b.md',
      'src/pages/about.md',
    ]);
    expect(model.totalMarkdown).toBe(3);
    expect(model.excludedCount).toBe(1);
    expect(model.nodes.map((node) => node.name)).toEqual(['content', 'pages']);
    expect(buildTreeModel(entries, config)).toBe(model);
  });
});

describe('tree model root files', () => {
  const extensions = ['.md'];
  const build = (paths: string[], rootDir: string) =>
    buildTreeModel(
      paths.map((path) => ({ path, sha: path })),
      { rootDir, extensions, excludes: [] },
    );

  it('keeps articles that sit directly in the content root', () => {
    const atRoot = build(['abc.md', 'notes/deep/x.md'], '/');
    expect(atRoot.files.map((file) => file.path)).toEqual(['abc.md', 'notes/deep/x.md']);
    expect(atRoot.totalMarkdown).toBe(2);
    expect(atRoot.nodes.map((node) => node.name)).toEqual(['notes', 'abc.md']);
    expect(atRoot.nodes[1]).toMatchObject({ type: 'file', path: 'abc.md', name: 'abc.md' });

    const emptyRoot = build(['abc.md', 'notes/x.md'], '');
    expect(emptyRoot.nodes.map((node) => node.name)).toEqual(['notes', 'abc.md']);

    const leadingSlash = build(['/abc.md', 'notes/x.md'], '/');
    expect(leadingSlash.nodes.map((node) => node.name)).toEqual(['notes', 'abc.md']);
  });

  it('keeps root files visible for relative roots and trailing slashes', () => {
    const underSrc = build(['src/abc.md', 'src/content/blog/b.md'], 'src');
    expect(underSrc.nodes.map((node) => node.name)).toEqual(['content', 'abc.md']);
    expect(underSrc.nodes[1]).toMatchObject({ type: 'file', path: 'src/abc.md' });

    const trailing = build(['src/abc.md', 'src/content/blog/b.md'], 'src/');
    expect(trailing.nodes.map((node) => node.name)).toEqual(['content', 'abc.md']);

    const dotted = build(['src/abc.md', 'src/content/blog/b.md'], './src');
    expect(dotted.nodes.map((node) => node.name)).toEqual(['content', 'abc.md']);
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
    expect(findUnknownPlaceholders('x {nope} {path} {title}')).toEqual(['nope']);
  });

  it('renders {title} and falls back to the file stem', () => {
    expect(
      renderCommitMessage('{title} · update: {path}', {
        path: 'src/content/blog/note/a.md',
        action: 'update',
        date: '2026-01-01',
        title: '便笺',
      }),
    ).toBe('便笺 · update: src/content/blog/note/a.md');
    expect(resolveCommitTitle(undefined, 'src/content/blog/note/a.md')).toBe('a');
    expect(resolveCommitTitle('  便笺  ', 'src/content/blog/note/a.md')).toBe('便笺');
  });

  it('falls back when the template is empty', () => {
    expect(renderCommitMessage('  ', { path: 'a.md', action: 'create', date: '2026-01-01' })).toBe('create: a.md');
  });
});
