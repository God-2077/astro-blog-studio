import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/config/defaults';
import { settingsSchema } from '@/lib/config/schema';
import { contentSignature } from '@/lib/content/model';
import {
  buildDaybookDocument,
  DAYBOOK_AUX_PATHS,
  DAYBOOK_FIELDS,
  daybookFieldsForPath,
  daybookKindForPath,
  isDaybookAllowlistedPath,
  isDaybookContentPath,
  nextDailyFilename,
} from '@/lib/daybook/model';
import { buildTreeModel } from '@/lib/tree/model';
import { formatInTimeZone } from '@/lib/utils/date';

describe('daybook paths and fields', () => {
  it('maps the three content directories to their schema field sets', () => {
    expect(daybookKindForPath('daily/2026-06-01-01.md')).toBe('daily');
    expect(daybookKindForPath('post/hello.md')).toBe('post');
    expect(daybookKindForPath('pages/guestbook.md')).toBe('page');
    expect(daybookKindForPath('config/site.ts')).toBeNull();
    expect(daybookKindForPath('spec/about.mdx')).toBeNull();

    expect(daybookFieldsForPath('daily/x.md')).toBe(DAYBOOK_FIELDS.daily);
    expect(daybookFieldsForPath('post/x.md')).toBe(DAYBOOK_FIELDS.post);
    expect(daybookFieldsForPath('pages/x.md')).toBe(DAYBOOK_FIELDS.page);
    expect(daybookFieldsForPath('spec/about.mdx')).toEqual([]);
  });

  it('keeps only the daybook allowlist and its content markdown visible', () => {
    const extensions = ['.md', '.mdx'];
    expect(isDaybookAllowlistedPath('daily/2026-01-01-01.md', extensions)).toBe(true);
    expect(isDaybookAllowlistedPath('config/site.ts', extensions)).toBe(true);
    expect(isDaybookAllowlistedPath('config/config.ts', extensions)).toBe(false);
    expect(isDaybookAllowlistedPath('spec/about.mdx', extensions)).toBe(true);
    expect(isDaybookAllowlistedPath('README.md', extensions)).toBe(false);
    expect(isDaybookAllowlistedPath('public/avatar.svg', extensions)).toBe(false);
    expect(isDaybookContentPath('pages/about.md', extensions)).toBe(true);
    expect(isDaybookContentPath('config/site.ts', extensions)).toBe(false);
    expect(isDaybookContentPath('spec/about.mdx', extensions)).toBe(false);
    for (const aux of DAYBOOK_AUX_PATHS) {
      expect(isDaybookAllowlistedPath(aux, extensions)).toBe(true);
    }
  });

  it('numbers only strict date-NN diary files, ignoring date-slug names', () => {
    const paths = [
      'daily/2026-06-01-01.md',
      'daily/2026-06-01-03.mdx',
      'daily/2026-06-01-hello.md',
      'daily/2026-06-01-9.md',
      'daily/archive/2026-06-01-99.md',
      'post/2026-06-01-50.md',
      'daily/2026-05-31-09.md',
    ];
    expect(nextDailyFilename(paths, '2026-06-01')).toBe('2026-06-01-04');
    expect(nextDailyFilename(paths, '2026-06-02')).toBe('2026-06-02-01');
    expect(nextDailyFilename([], '2026-06-02')).toBe('2026-06-02-01');
  });

  it('builds the initial frontmatter with the daybook schema defaults', () => {
    const daily = buildDaybookDocument('daily', { title: '今天的记录', date: '2026-06-01' });
    expect(daily).toContain("date: '2026-06-01'");
    expect(daily).toContain('title: 今天的记录');
    expect(daily).toContain('draft: false');
    expect(daily).toContain('pin: false');
    expect(daily).toContain('comments: true');
    expect(daily).toContain('hideHomeTitle: false');
    expect(daily.endsWith('---\n\n')).toBe(true);

    const post = buildDaybookDocument('post', { title: '文章', date: '2026-06-01' });
    expect(post).toContain('categories: []');
    expect(post).toContain('tags: []');
    expect(post).toContain('keywords: []');
    expect(post).toContain('draft: false');
    expect(post).toContain('pin: false');
    expect(post).toContain('comments: true');

    const page = buildDaybookDocument('page', { title: '关于', date: '2026-06-01' });
    expect(page).toContain('title: 关于');
    expect(page).toContain("date: '2026-06-01'");
    expect(page).toContain('draft: false');
    expect(page).toContain('hideFrom: []');
    expect(page).toContain('comments: true');
    expect(page).not.toContain('pin:');
    expect(page).not.toContain('slug:');
  });

  it('uses the repository timezone date for the default daybook file name', () => {
    const instant = new Date('2026-06-01T16:30:00Z');
    expect(formatInTimeZone(instant, 'Asia/Shanghai').slice(0, 10)).toBe('2026-06-02');
  });
});

describe('daybook tree and cache identity', () => {
  it('shows exactly the daybook content and auxiliary files at the repo root', () => {
    const entries = [
      { path: 'daily/2026-06-01-01.md', sha: 'a' },
      { path: 'post/hello.md', sha: 'b' },
      { path: 'pages/guestbook.md', sha: 'c' },
      { path: 'pages/secret.md', sha: 'd' },
      { path: 'config/site.ts', sha: 'e' },
      { path: 'config/links.ts', sha: 'f' },
      { path: 'spec/about.mdx', sha: 'g' },
      { path: 'README.md', sha: 'h' },
      { path: 'public/avatar.svg', sha: 'i' },
      { path: 'post/notes.txt', sha: 'j' },
    ];
    const model = buildTreeModel(entries, {
      rootDir: '',
      extensions: ['.md', '.mdx'],
      excludes: ['pages/secret.md'],
      daybook: true,
    });
    expect(model.files.map((file) => file.path)).toEqual([
      'config/links.ts',
      'config/site.ts',
      'daily/2026-06-01-01.md',
      'pages/guestbook.md',
      'post/hello.md',
      'spec/about.mdx',
    ]);
    expect(model.totalMarkdown).toBe(3);
    expect(model.excludedCount).toBe(1);
    expect(model.nodes.map((node) => node.name)).toEqual(['config', 'daily', 'pages', 'post', 'spec']);
  });

  it('adds a daybook marker only for daybook cache signatures', () => {
    const base = { rootDir: '', extensions: ['.md'], excludes: [] };
    const blog = contentSignature({ ...base, daybook: false });
    const daybook = contentSignature({ ...base, daybook: true });
    expect(blog).not.toContain('daybook');
    expect(daybook).toBe(`${blog}\u0000daybook`);
  });
});

describe('daybook settings defaults', () => {
  it('defaults the flag to false for settings saved before daybook support', () => {
    const legacyContent = { ...defaultSettings.content } as Record<string, unknown>;
    delete legacyContent.daybook;
    const parsed = settingsSchema.safeParse({ ...defaultSettings, content: legacyContent });
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.content.daybook : null).toBe(false);
  });

  it('keeps an explicitly enabled daybook flag', () => {
    const parsed = settingsSchema.safeParse({
      ...defaultSettings,
      content: { ...defaultSettings.content, daybook: true },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.content.daybook : null).toBe(true);
  });
});
