import { describe, expect, it } from 'vitest';
import { resolveManualFilename, resolveTitleFilename } from '@/lib/paths/filename';

describe('manual new-post filenames', () => {
  it('keeps spaces, CJK, full-width punctuation, emoji, and supported extensions', () => {
    expect(resolveManualFilename('我的 笔记.mdx')).toEqual({
      filename: '我的 笔记.mdx',
      issue: null,
      unsupportedSuffix: null,
    });
    expect(resolveManualFilename('便笺：今天的语法备忘.md')).toMatchObject({
      filename: '便笺：今天的语法备忘.md',
      issue: null,
    });
    expect(resolveManualFilename('🚀 发布计划.md')).toMatchObject({ filename: '🚀 发布计划.md', issue: null });
    expect(resolveManualFilename('note.MDX')).toMatchObject({ filename: 'note.MDX', issue: null });
    expect(resolveManualFilename('  note.md  ')).toMatchObject({ filename: 'note.md', issue: null });
  });

  it('appends .md only when there is no suffix, and keeps explicit suffixes', () => {
    expect(resolveManualFilename('note')).toEqual({ filename: 'note.md', issue: null, unsupportedSuffix: null });
    expect(resolveManualFilename('note.txt')).toEqual({
      filename: 'note.txt',
      issue: null,
      unsupportedSuffix: '.txt',
    });
    expect(resolveManualFilename('note.md.txt')).toEqual({
      filename: 'note.md.txt',
      issue: null,
      unsupportedSuffix: '.txt',
    });
    expect(resolveManualFilename('我的 笔记.txt')).toEqual({
      filename: '我的 笔记.txt',
      issue: null,
      unsupportedSuffix: '.txt',
    });
    expect(resolveManualFilename('note.TXT')).toEqual({
      filename: 'note.TXT',
      issue: null,
      unsupportedSuffix: '.TXT',
    });
    expect(resolveManualFilename('.env')).toEqual({ filename: '.env.md', issue: null, unsupportedSuffix: null });
  });

  it('rejects names that are not legal on the platform', () => {
    expect(resolveManualFilename('   ')).toMatchObject({ filename: '', issue: { code: 'empty' } });
    expect(resolveManualFilename('a/b.md')).toMatchObject({ filename: '', issue: { code: 'pathSeparator' } });
    expect(resolveManualFilename('a\\b.md')).toMatchObject({ filename: '', issue: { code: 'pathSeparator' } });
    expect(resolveManualFilename('a\u0000b.md')).toMatchObject({ filename: '', issue: { code: 'control' } });
    expect(resolveManualFilename('a?b.md')).toMatchObject({
      filename: '',
      issue: { code: 'illegalChars', chars: '?' },
    });
    expect(resolveManualFilename('a<b>c.md')).toMatchObject({
      filename: '',
      issue: { code: 'illegalChars', chars: '< >' },
    });
    expect(resolveManualFilename('CON.md')).toMatchObject({
      filename: '',
      issue: { code: 'reserved', name: 'CON' },
    });
    expect(resolveManualFilename('con')).toMatchObject({
      filename: '',
      issue: { code: 'reserved', name: 'con' },
    });
    expect(resolveManualFilename('nul.txt')).toMatchObject({
      filename: '',
      issue: { code: 'reserved', name: 'nul' },
    });
    expect(resolveManualFilename('LPT9.log')).toMatchObject({
      filename: '',
      issue: { code: 'reserved', name: 'LPT9' },
    });
    expect(resolveManualFilename('note.')).toMatchObject({ filename: '', issue: { code: 'trailingDot' } });
    expect(resolveManualFilename('.md')).toMatchObject({ filename: '', issue: { code: 'empty' } });
    expect(resolveManualFilename('.mdx')).toMatchObject({ filename: '', issue: { code: 'empty' } });
    expect(resolveManualFilename('COM10.md')).toMatchObject({ filename: 'COM10.md', issue: null });
  });

  it('drops the suffix hint when the final name is invalid', () => {
    expect(resolveManualFilename('CON.txt')).toEqual({
      filename: '',
      issue: { code: 'reserved', name: 'CON' },
      unsupportedSuffix: null,
    });
  });
});

describe('title new-post filenames', () => {
  it('keeps the existing slug rules and defaults to .md', () => {
    expect(resolveTitleFilename('E2E 新建稿')).toEqual({
      filename: 'E2E-新建稿.md',
      issue: null,
      unsupportedSuffix: null,
    });
  });

  it('recognizes .md and .mdx suffixes in titles', () => {
    expect(resolveTitleFilename('MDX 入门.mdx')).toEqual({
      filename: 'MDX-入门.mdx',
      issue: null,
      unsupportedSuffix: null,
    });
    expect(resolveTitleFilename('Hello.MD')).toEqual({
      filename: 'Hello.MD',
      issue: null,
      unsupportedSuffix: null,
    });
  });

  it('rejects punctuation-only or reserved titles', () => {
    expect(resolveTitleFilename('   ')).toMatchObject({ filename: '', issue: { code: 'empty' } });
    expect(resolveTitleFilename('!!!')).toMatchObject({ filename: '', issue: { code: 'empty' } });
    expect(resolveTitleFilename('CON')).toMatchObject({
      filename: '',
      issue: { code: 'reserved', name: 'CON' },
    });
  });
});
