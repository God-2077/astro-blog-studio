import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/config/defaults';
import { settingsSchema } from '@/lib/config/schema';
import {
  buildFrontmatterPatch,
  buildNewPostDocument,
  cloneFrontmatterFields,
  DEFAULT_FRONTMATTER_FIELDS,
  type FrontmatterField,
  formValuesFromData,
  validateFrontmatterFields,
  valueToDisplay,
} from '@/lib/frontmatter/fields';

describe('frontmatter field definitions', () => {
  it('ships the common hello-world fields with title/date required', () => {
    const names = DEFAULT_FRONTMATTER_FIELDS.map((field) => field.name);
    expect(names).toEqual([
      'title',
      'date',
      'updated',
      'description',
      'categories',
      'tags',
      'draft',
      'sticky',
      'password',
      'cover',
      'keywords',
    ]);
    expect(DEFAULT_FRONTMATTER_FIELDS.filter((field) => field.required).map((field) => field.name)).toEqual(['title', 'date']);
    expect(cloneFrontmatterFields(DEFAULT_FRONTMATTER_FIELDS)).not.toBe(DEFAULT_FRONTMATTER_FIELDS);
  });

  it('validates names, duplicates and reserved names', () => {
    expect(
      validateFrontmatterFields([
        { name: 'title', type: 'string', required: true },
        { name: '', type: 'string', required: false },
        { name: 'bad name', type: 'string', required: false },
        { name: '__proto__', type: 'string', required: false },
        { name: 'title', type: 'string', required: false },
      ]).map((issue) => issue.message),
    ).toEqual(
      expect.arrayContaining([
        '字段名不能为空',
        '字段名只能包含字母、数字、下划线或连字符，且以字母/下划线开头',
        '字段名 __proto__ 是保留名',
        '字段名 title 重复',
      ]),
    );
    expect(validateFrontmatterFields([{ name: 'custom_field', type: 'boolean', required: false }])).toEqual([]);
  });

  it('migrates persisted settings without frontmatter fields', () => {
    const legacyWithTemplate = {
      ...defaultSettings,
      frontmatter: undefined,
      editor: { ...defaultSettings.editor, frontmatterTemplate: '---\ntitle: x\n---' },
    };
    const parsed = settingsSchema.safeParse(legacyWithTemplate);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.frontmatter.fields).toEqual(DEFAULT_FRONTMATTER_FIELDS);
    expect('frontmatterTemplate' in parsed.data.editor).toBe(false);
  });
});

describe('frontmatter form mapping', () => {
  it('maps nested categories and lists into editable strings', () => {
    const values = formValuesFromData(DEFAULT_FRONTMATTER_FIELDS, {
      title: '标题',
      categories: [['笔记', '备忘'], ['文章']],
      tags: ['a', 'b'],
      draft: true,
      sticky: false,
    });
    expect(values.title).toBe('标题');
    expect(values.categories).toBe('笔记 > 备忘, 文章');
    expect(values.tags).toBe('a, b');
    expect(values.draft).toBe(true);
    expect(values.sticky).toBe(false);
    expect(valueToDisplay({ name: 'categories', type: 'list', required: false }, [['a', 'b']])).toBe('a > b');
  });

  it('builds a minimal patch and removes cleared optional fields', () => {
    const fields: FrontmatterField[] = [
      { name: 'title', type: 'string', required: true },
      { name: 'description', type: 'string', required: false },
      { name: 'draft', type: 'boolean', required: false },
      { name: 'tags', type: 'list', required: false },
      { name: 'date', type: 'date', required: false },
    ];
    const result = buildFrontmatterPatch(
      fields,
      { title: 'New', description: '', draft: false, tags: '', date: '' },
      { title: 'Old', draft: true, tags: ['a'] },
    );
    expect(result.errors).toEqual({});
    expect(result.patch).toEqual({ title: 'New', draft: false, tags: null });
  });

  it('blocks empty required fields but accepts required false booleans', () => {
    const requiredTitle = buildFrontmatterPatch([{ name: 'title', type: 'string', required: true }], { title: '   ' }, {});
    expect(requiredTitle.errors.title).toBeTruthy();
    expect(requiredTitle.patch).toEqual({});

    const requiredBoolean = buildFrontmatterPatch([{ name: 'draft', type: 'boolean', required: true }], { draft: false }, {});
    expect(requiredBoolean.errors).toEqual({});
    expect(requiredBoolean.patch).toEqual({ draft: false });
  });

  it('validates numbers and dates', () => {
    const numberError = buildFrontmatterPatch([{ name: 'order', type: 'number', required: false }], { order: 'NaN-ish' }, {});
    expect(numberError.errors.order).toBeTruthy();

    const dateError = buildFrontmatterPatch([{ name: 'date', type: 'date', required: true }], { date: '2024/01/01' }, {});
    expect(dateError.errors.date).toBeTruthy();

    const numberOk = buildFrontmatterPatch([{ name: 'order', type: 'number', required: false }], { order: '42' }, {});
    expect(numberOk.patch).toEqual({ order: 42 });
  });

  it('parses nested categories and fills updated automatically', () => {
    const fields: FrontmatterField[] = [
      { name: 'categories', type: 'list', required: false },
      { name: 'updated', type: 'date', required: false },
    ];
    const result = buildFrontmatterPatch(
      fields,
      { categories: '笔记 > 备忘, 文章', updated: '' },
      {},
      { autoUpdatedAt: '2026-10-18 12:00:00' },
    );
    expect(result.patch).toEqual({
      categories: [['笔记', '备忘'], ['文章']],
      updated: '2026-10-18 12:00:00',
    });
  });

  it('does not remove unchanged empty optional values', () => {
    const result = buildFrontmatterPatch(
      [
        { name: 'password', type: 'string', required: false },
        { name: 'tags', type: 'list', required: false },
      ],
      { password: '', tags: '' },
      { password: '', tags: [] },
    );
    expect(result.patch).toEqual({});
  });
});

describe('new post document', () => {
  it('creates title/date/draft frontmatter and leaves optional fields for the editor', () => {
    const text = buildNewPostDocument(DEFAULT_FRONTMATTER_FIELDS, {
      title: '新文章',
      date: '2026-10-18 12:00:00',
    });
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain('title: 新文章');
    expect(text).toContain("date: '2026-10-18 12:00:00'");
    expect(text).toContain('draft: true');
    expect(text).not.toContain('categories');
    expect(text.endsWith('---\n\n')).toBe(true);
  });

  it('returns an empty document when no matching fields are configured', () => {
    expect(buildNewPostDocument([{ name: 'order', type: 'number', required: false }], { title: 'x', date: 'y' })).toBe('');
  });
});
