import { serializeFieldLines } from '@/lib/markdown/document';

export const FRONTMATTER_FIELD_TYPES = ['string', 'date', 'number', 'boolean', 'list'] as const;

export type FrontmatterFieldType = (typeof FRONTMATTER_FIELD_TYPES)[number];

export interface FrontmatterField {
  name: string;
  type: FrontmatterFieldType;
  required: boolean;
}

export type FrontmatterFormValue = string | boolean;
export type FrontmatterFormValues = Record<string, FrontmatterFormValue>;

const RESERVED_FIELD_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;

export const FIELD_TYPE_LABELS: Record<FrontmatterFieldType, string> = {
  string: 'string',
  date: 'date',
  number: 'number',
  boolean: 'boolean',
  list: 'list',
};

/** Fields actively used by hello-world.md / the astro-blog content schema. */
export const DEFAULT_FRONTMATTER_FIELDS: FrontmatterField[] = [
  { name: 'title', type: 'string', required: true },
  { name: 'date', type: 'date', required: true },
  { name: 'updated', type: 'date', required: false },
  { name: 'description', type: 'string', required: false },
  { name: 'categories', type: 'list', required: false },
  { name: 'tags', type: 'list', required: false },
  { name: 'draft', type: 'boolean', required: false },
  { name: 'sticky', type: 'boolean', required: false },
  { name: 'password', type: 'string', required: false },
  { name: 'cover', type: 'string', required: false },
  { name: 'keywords', type: 'list', required: false },
];

/** All frontmatter keys supported by astro-blog/src/content/config.ts. */
export const KNOWN_BLOG_FIELDS: Record<string, { type: FrontmatterFieldType; required: boolean; hint?: string }> = {
  title: { type: 'string', required: true },
  date: { type: 'date', required: true },
  updated: { type: 'date', required: false },
  description: { type: 'string', required: false, hint: 'SEO / 列表摘要' },
  link: { type: 'string', required: false, hint: '自定义 URL slug' },
  cover: { type: 'string', required: false, hint: '封面图片路径' },
  tags: { type: 'list', required: false },
  subtitle: { type: 'string', required: false },
  catalog: { type: 'boolean', required: false },
  categories: { type: 'list', required: false, hint: '用 > 表示层级' },
  sticky: { type: 'boolean', required: false },
  draft: { type: 'boolean', required: false },
  tocNumbering: { type: 'boolean', required: false },
  excludeFromSummary: { type: 'boolean', required: false },
  math: { type: 'boolean', required: false },
  quiz: { type: 'boolean', required: false },
  password: { type: 'string', required: false },
  keywords: { type: 'list', required: false },
  hideFrom: { type: 'string', required: false, hint: 'home / home_rss / rss / all' },
  nofollow: { type: 'boolean', required: false },
  noindex: { type: 'boolean', required: false },
  noarchive: { type: 'boolean', required: false },
};

export function cloneFrontmatterFields(fields: readonly FrontmatterField[]): FrontmatterField[] {
  return fields.map((field) => ({ ...field }));
}

export function isReservedFieldName(name: string): boolean {
  return RESERVED_FIELD_NAMES.has(name);
}

export function isValidFieldName(name: string): boolean {
  return FIELD_NAME_RE.test(name) && !isReservedFieldName(name);
}

export interface FrontmatterFieldIssue {
  index: number;
  message: string;
}

export function validateFrontmatterFields(fields: FrontmatterField[]): FrontmatterFieldIssue[] {
  const issues: FrontmatterFieldIssue[] = [];
  if (fields.length > 40) {
    issues.push({ index: -1, message: '字段最多 40 个' });
  }
  const seen = new Set<string>();
  fields.forEach((field, index) => {
    const name = field.name.trim();
    if (!name) {
      issues.push({ index, message: '字段名不能为空' });
      return;
    }
    if (!FIELD_NAME_RE.test(name)) {
      issues.push({ index, message: '字段名只能包含字母、数字、下划线或连字符，且以字母/下划线开头' });
    } else if (isReservedFieldName(name)) {
      issues.push({ index, message: `字段名 ${name} 是保留名` });
    }
    if (!FRONTMATTER_FIELD_TYPES.includes(field.type)) {
      issues.push({ index, message: '字段类型无效' });
    }
    if (seen.has(name)) {
      issues.push({ index, message: `字段名 ${name} 重复` });
    }
    seen.add(name);
  });
  return issues;
}

export function normalizeFrontmatterFields(fields: FrontmatterField[]): FrontmatterField[] {
  return fields.map((field) => ({ ...field, name: field.name.trim() }));
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumberText(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value : '';
}

function stringItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function valueToDisplay(field: FrontmatterField, value: unknown): string {
  switch (field.type) {
    case 'boolean':
      return value === true ? 'true' : 'false';
    case 'number':
      return asNumberText(value);
    case 'list': {
      if (!Array.isArray(value)) return typeof value === 'string' ? value : '';
      return value
        .map((item) => (Array.isArray(item) ? stringItems(item).join(' > ') : typeof item === 'string' ? item : ''))
        .filter(Boolean)
        .join(', ');
    }
    default:
      return asString(value);
  }
}

export function formValuesFromData(fields: readonly FrontmatterField[], data: Record<string, unknown>): FrontmatterFormValues {
  const values: FrontmatterFormValues = {};
  for (const field of fields) {
    if (field.type === 'boolean') values[field.name] = data[field.name] === true;
    else values[field.name] = valueToDisplay(field, data[field.name]);
  }
  return values;
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseListValue(field: FrontmatterField, text: string): string[] | string[][] | undefined {
  const items = splitList(text);
  if (items.length === 0) return undefined;
  if (field.name === 'categories' && items.some((item) => item.includes('>'))) {
    return items.map((item) =>
      item
        .split('>')
        .map((part) => part.trim())
        .filter(Boolean),
    );
  }
  return items;
}

export function isFormValueEmpty(field: FrontmatterField, value: FrontmatterFormValue): boolean {
  if (field.type === 'boolean') return false;
  return (typeof value === 'string' ? value : '').trim() === '';
}

function validateFieldValue(field: FrontmatterField, value: FrontmatterFormValue): string | null {
  if (field.type === 'boolean') return null;
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return field.required ? '必填字段' : null;
  }
  if (field.type === 'date' && !DATE_RE.test(text)) {
    return '日期格式应为 YYYY-MM-DD HH:mm:ss';
  }
  if (field.type === 'number' && !Number.isFinite(Number(text))) {
    return '请输入有效数字';
  }
  return null;
}

function toPatchValue(field: FrontmatterField, value: FrontmatterFormValue): unknown {
  if (field.type === 'boolean') return value === true;
  const text = typeof value === 'string' ? value.trim() : '';
  if (field.type === 'number') return Number(text);
  if (field.type === 'list') return parseListValue(field, text);
  return text;
}

export interface BuildPatchOptions {
  autoUpdatedAt?: string;
}

export interface BuildPatchResult {
  patch: Record<string, unknown>;
  errors: Record<string, string>;
}

/**
 * Build the minimal frontmatter patch for the configured fields.
 * - unchanged fields (including empty values like `password: ''` or `tags: []`) are skipped
 * - optional fields cleared in the form are removed with `null`
 * - required fields are validated before any API call
 * - `updated` is filled from options.autoUpdatedAt when configured and not manually changed
 */
export function buildFrontmatterPatch(
  fields: readonly FrontmatterField[],
  values: FrontmatterFormValues,
  originalData: Record<string, unknown>,
  options: BuildPatchOptions = {},
): BuildPatchResult {
  const patch: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const hasUpdatedField = fields.some((field) => field.name === 'updated' && field.type === 'date');

  for (const field of fields) {
    const value = values[field.name] ?? (field.type === 'boolean' ? false : '');
    const original = originalData[field.name];
    const error = validateFieldValue(field, value);
    if (error) {
      errors[field.name] = error;
      continue;
    }

    if (field.type === 'boolean') {
      const bool = value === true;
      if (original === undefined) {
        if (bool || field.required) patch[field.name] = bool;
        continue;
      }
      if (bool === (original === true)) continue;
      patch[field.name] = bool;
      continue;
    }

    const text = typeof value === 'string' ? value : '';
    const originalDisplay = valueToDisplay(field, original);
    if (text === originalDisplay) continue;
    if (!text.trim()) {
      if (original !== undefined) patch[field.name] = null;
      continue;
    }
    patch[field.name] = toPatchValue(field, value);
  }

  if (options.autoUpdatedAt && hasUpdatedField && !('updated' in patch) && !errors.updated) {
    patch.updated = options.autoUpdatedAt;
  }

  return { patch, errors };
}

export interface NewPostDocumentInput {
  title: string;
  date: string;
}

export function buildNewPostDocument(fields: readonly FrontmatterField[], input: NewPostDocumentInput): string {
  const lines: string[] = [];
  for (const field of fields) {
    if (field.name === 'title' && field.type === 'string' && input.title.trim()) {
      lines.push(...serializeFieldLines(field.name, input.title.trim()));
    } else if (field.name === 'date' && field.type === 'date') {
      lines.push(...serializeFieldLines(field.name, input.date));
    } else if (field.name === 'draft' && field.type === 'boolean') {
      lines.push(...serializeFieldLines(field.name, true));
    }
  }
  if (lines.length === 0) return '';
  return `---\n${lines.join('\n')}\n---\n\n`;
}

export function knownFieldHint(name: string): string | undefined {
  return KNOWN_BLOG_FIELDS[name.trim()]?.hint;
}
