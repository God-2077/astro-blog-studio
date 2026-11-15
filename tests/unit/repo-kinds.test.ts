import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/config/defaults';
import { type Settings, settingsSchema } from '@/lib/config/schema';
import { buildFrontmatterPatch, buildNewPostDocument, formValuesFromData, titleFieldMode } from '@/lib/frontmatter/fields';
import {
  creatableDaybookCollections,
  DAYBOOK_COLLECTIONS,
  daybookCollectionById,
  daybookCollectionOf,
  repoKindPreset,
  resolveFields,
} from '@/lib/repos/kinds';
import { profileFromSettings } from '@/lib/repos/profile';

function daybookSettings(): Settings {
  return {
    ...structuredClone(defaultSettings),
    repo: { owner: 'God-2077', name: 'astro-daybook-content', branch: 'main' },
    content: {
      ...structuredClone(defaultSettings.content),
      repoKind: 'daybook',
      rootDir: '',
      excludes: [...repoKindPreset('daybook').content.excludes],
    },
    frontmatter: { fields: [...repoKindPreset('daybook').fallbackFields] },
  };
}

describe('repository kind presets', () => {
  it('uses the repository root and Daybook exclusions', () => {
    const preset = repoKindPreset('daybook');

    expect(preset.content.repoKind).toBe('daybook');
    expect(preset.content.rootDir).toBe('');
    expect(preset.content.extensions).toEqual(['.md', '.mdx']);
    expect(preset.content.excludes).toEqual(['*.md', '*.mdx', 'public', 'config', '.github', 'node_modules']);
    expect(repoKindPreset('blog').content.rootDir).toBe('src');
  });

  it('returns independent arrays so editing one repo cannot leak into another', () => {
    const first = repoKindPreset('daybook');
    first.content.excludes.push('notes');
    const firstField = first.fallbackFields[0];
    if (!firstField) throw new Error('expected a fallback field');
    firstField.name = 'changed';

    const second = repoKindPreset('daybook');
    expect(second.content.excludes).not.toContain('notes');
    expect(second.fallbackFields[0]?.name).toBe('title');
  });

  it('falls back to blog for settings saved before repository types existed', () => {
    const legacy = structuredClone(defaultSettings) as Record<string, unknown>;
    const content = legacy.content as Record<string, unknown>;
    delete content.repoKind;

    const parsed = settingsSchema.safeParse(legacy);

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.content.repoKind : null).toBe('blog');
  });

  it('falls back to blog for junk repository kinds', () => {
    const parsed = settingsSchema.safeParse({
      ...defaultSettings,
      content: { ...defaultSettings.content, repoKind: 'notebook' },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.content.repoKind : null).toBe('blog');
  });

  it('defaults inactive profiles saved before repository types existed', () => {
    const legacyProfile = {
      owner: 'acme',
      name: 'old',
      branch: 'main',
      content: { rootDir: 'src', extensions: ['.md'], excludes: [], timezone: 'Asia/Shanghai', indexConcurrency: 3 },
      commit: structuredClone(defaultSettings.commit),
      frontmatter: structuredClone(defaultSettings.frontmatter),
    };
    const parsed = settingsSchema.safeParse({ ...defaultSettings, repos: [legacyProfile] });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.repos[0]?.content.repoKind : null).toBe('blog');
  });
});

describe('Daybook collections', () => {
  it('maps the first path segment, stripping the content root first', () => {
    expect(daybookCollectionOf('daily/2026-11-15.md')?.id).toBe('daily');
    expect(daybookCollectionOf('content/daily/2026-11-15.md', 'content')?.id).toBe('daily');
    expect(daybookCollectionOf('post/hello.md')?.id).toBe('post');
    expect(daybookCollectionOf('pages/about.md')?.id).toBe('pages');
    expect(daybookCollectionOf('spec/about.mdx')?.id).toBe('spec');
    expect(daybookCollectionOf('README.md')).toBeNull();
  });

  it('exposes only daily/post/pages for new posts', () => {
    expect(creatableDaybookCollections().map((collection) => collection.id)).toEqual(['daily', 'post', 'pages']);
    expect(daybookCollectionById('spec')?.creatable).toBe(false);
  });

  it('matches the theme schema field names per collection', () => {
    const names = (id: 'daily' | 'post' | 'pages' | 'spec'): string[] =>
      (daybookCollectionById(id)?.fields ?? []).map((field) => field.name);

    expect(names('daily')).toEqual([
      'date',
      'title',
      'description',
      'updated',
      'category',
      'slug',
      'permalink',
      'draft',
      'pin',
      'password',
      'hideFrom',
      'comments',
      'hideHomeTitle',
    ]);
    expect(names('post')).toEqual([
      'title',
      'date',
      'updated',
      'description',
      'categories',
      'tags',
      'keywords',
      'slug',
      'permalink',
      'draft',
      'pin',
      'password',
      'hideFrom',
      'comments',
    ]);
    expect(names('pages')).toEqual(['title', 'date', 'updated', 'description', 'draft', 'hideFrom', 'comments']);
    expect(names('spec')).toEqual([]);
  });

  it('resolves fields by path and keeps the blog behavior unchanged', () => {
    const settings = daybookSettings();
    expect(resolveFields(settings, 'daily/2026-11-15.md').map((field) => field.name)).toContain('category');
    expect(resolveFields(settings, 'post/hello.md').map((field) => field.name)).toContain('categories');
    expect(resolveFields(settings, 'notes/unfiled.md')).toEqual(settings.frontmatter.fields);
    expect(resolveFields(settings, 'content/daily/x.md')).toEqual(settings.frontmatter.fields);

    const blog = structuredClone(defaultSettings);
    expect(resolveFields(blog, 'src/content/blog/x.md')).toEqual(blog.frontmatter.fields);
  });

  it('reports the title mode used by the new-post dialog', () => {
    expect(titleFieldMode(daybookCollectionById('daily')?.fields ?? [])).toBe('optional');
    expect(titleFieldMode(daybookCollectionById('post')?.fields ?? [])).toBe('required');
    expect(titleFieldMode(daybookCollectionById('spec')?.fields ?? [])).toBe('none');
  });
});

describe('Daybook frontmatter writes', () => {
  it('creates a daily note with date and draft but no post-only keys', () => {
    const fields = daybookCollectionById('daily')?.fields ?? [];
    const text = buildNewPostDocument(fields, { title: '', date: '2026-11-15' });

    expect(text).toContain("date: '2026-11-15'");
    expect(text).toContain('draft: true');
    expect(text).not.toContain('categories');
    expect(text).not.toContain('tags');
  });

  it('keeps Daybook categories flat', () => {
    const field = { name: 'categories', type: 'list' as const, required: false };
    const { patch } = buildFrontmatterPatch(
      [field],
      { categories: '随笔 > 日记' },
      {},
      {
        nestedCategories: false,
      },
    );

    expect(patch.categories).toEqual(['随笔 > 日记']);
  });

  it('still nests blog categories by default', () => {
    const field = { name: 'categories', type: 'list' as const, required: false };
    const { patch } = buildFrontmatterPatch([field], { categories: '随笔 > 日记' }, {});

    expect(patch.categories).toEqual([['随笔', '日记']]);
  });

  it('uses the theme boolean default when the key is absent', () => {
    const comments = { name: 'comments', type: 'boolean' as const, required: false, defaultValue: true };

    expect(formValuesFromData([comments], {})).toEqual({ comments: true });
    expect(buildFrontmatterPatch([comments], { comments: false }, {}).patch).toEqual({ comments: false });
    expect(buildFrontmatterPatch([comments], { comments: true }, {}).patch).toEqual({});
  });
});

describe('repository profiles and types', () => {
  it('switches content and fallback fields when adding a Daybook repository', () => {
    const profile = profileFromSettings(
      defaultSettings,
      { owner: 'God-2077', name: 'astro-daybook-content', branch: 'main' },
      { repoKind: 'daybook', rootDir: '', excludes: ['*.md'] },
    );

    expect(profile.content.repoKind).toBe('daybook');
    expect(profile.content.rootDir).toBe('');
    expect(profile.content.excludes).toEqual(['*.md']);
    expect(profile.frontmatter.fields.map((field) => field.name)).not.toContain('categories');
  });

  it('inherits custom fields when the target kind matches the active kind', () => {
    const settings = daybookSettings();
    settings.frontmatter.fields = [{ name: 'custom', type: 'string', required: false }];

    const profile = profileFromSettings(settings, {
      owner: 'God-2077',
      name: 'another-daybook',
      branch: 'main',
    });

    expect(profile.content.repoKind).toBe('daybook');
    expect(profile.frontmatter.fields).toEqual([{ name: 'custom', type: 'string', required: false }]);
  });

  it('keeps every collection represented in the preset list', () => {
    expect(DAYBOOK_COLLECTIONS).toHaveLength(4);
  });
});
