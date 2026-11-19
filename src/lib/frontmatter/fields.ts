import { t } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n/messages';
import { serializeFieldLines } from '@/lib/markdown/document';

export const FRONTMATTER_FIELD_TYPES = ['string', 'text', 'date', 'number', 'boolean', 'list'] as const;

export type FrontmatterFieldType = (typeof FRONTMATTER_FIELD_TYPES)[number];

export interface FrontmatterField {
  name: string;
  type: FrontmatterFieldType;
  required: boolean;
  /** 显式设置优先；未设置时 text / title / description 默认独占一行。 */
  fullWidth?: boolean;
  /** 表单文本形式的默认值；仅用于新建文章，不补写已有文件。 */
  defaultValue?: string;
}

export type FrontmatterFormValue = string | boolean;
export type FrontmatterFormValues = Record<string, FrontmatterFormValue>;

const RESERVED_FIELD_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;

export const FIELD_TYPE_LABELS: Record<FrontmatterFieldType, string> = {
  string: 'string',
  text: 'text',
  date: 'date',
  number: 'number',
  boolean: 'boolean',
  list: 'list',
};

/** Commonly used frontmatter fields. */
export const DEFAULT_FRONTMATTER_FIELDS: FrontmatterField[] = [
  { name: 'title', type: 'string', required: true },
  { name: 'date', type: 'date', required: true },
  { name: 'updated', type: 'date', required: false },
  { name: 'description', type: 'string', required: false },
  { name: 'categories', type: 'list', required: false },
  { name: 'tags', type: 'list', required: false },
  { name: 'draft', type: 'boolean', required: false },
];

/** All frontmatter keys supported by astro-blog/src/content/config.ts. */
export const KNOWN_BLOG_FIELDS: Record<string, { type: FrontmatterFieldType; required: boolean; hint?: MessageKey }> = {
  title: { type: 'string', required: true },
  date: { type: 'date', required: true },
  updated: { type: 'date', required: false },
  description: { type: 'string', required: false, hint: 'common.fieldHint.description' },
  link: { type: 'string', required: false, hint: 'common.fieldHint.link' },
  cover: { type: 'string', required: false, hint: 'common.fieldHint.cover' },
  tags: { type: 'list', required: false },
  subtitle: { type: 'string', required: false },
  catalog: { type: 'boolean', required: false },
  categories: { type: 'list', required: false, hint: 'common.fieldHint.categories' },
  sticky: { type: 'boolean', required: false },
  draft: { type: 'boolean', required: false },
  tocNumbering: { type: 'boolean', required: false },
  excludeFromSummary: { type: 'boolean', required: false },
  math: { type: 'boolean', required: false },
  quiz: { type: 'boolean', required: false },
  password: { type: 'string', required: false },
  keywords: { type: 'list', required: false },
  hideFrom: { type: 'string', required: false, hint: 'common.fieldHint.hideFrom' },
  nofollow: { type: 'boolean', required: false },
  noindex: { type: 'boolean', required: false },
  noarchive: { type: 'boolean', required: false },
};

export function cloneFrontmatterFields(fields: readonly FrontmatterField[]): FrontmatterField[] {
  return fields.map((field) => ({ ...field }));
}

export function isFullWidthField(field: FrontmatterField): boolean {
  if (field.fullWidth !== undefined) return field.fullWidth;
  return field.type === 'text' || field.name === 'title' || field.name === 'description';
}

export function moveFrontmatterField(fields: readonly FrontmatterField[], from: number, to: number): FrontmatterField[] {
  const next = fields.slice();
  if (from === to || from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  if (!item) return next;
  next.splice(to, 0, item);
  return next;
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
    issues.push({ index: -1, message: t('errors.validation.maxFields') });
  }
  const seen = new Set<string>();
  fields.forEach((field, index) => {
    const name = field.name.trim();
    if (!name) {
      issues.push({ index, message: t('errors.validation.emptyName') });
      return;
    }
    if (!FIELD_NAME_RE.test(name)) {
      issues.push({ index, message: t('errors.validation.invalidName') });
    } else if (isReservedFieldName(name)) {
      issues.push({ index, message: t('errors.validation.reservedName', { name }) });
    }
    if (!FRONTMATTER_FIELD_TYPES.includes(field.type)) {
      issues.push({ index, message: t('errors.validation.invalidType') });
    }
    if (seen.has(name)) {
      issues.push({ index, message: t('errors.validation.duplicateName', { name }) });
    }
    const defaultIssue = validateDefaultValue(field);
    if (defaultIssue) {
      issues.push({ index, message: defaultIssue });
    }
    seen.add(name);
  });
  return issues;
}

function validateDefaultValue(field: FrontmatterField): string | null {
  const raw = field.defaultValue;
  if (raw === undefined || raw.trim() === '') return null;
  if (field.type === 'date' && !DATE_RE.test(raw.trim())) {
    return t('errors.validation.invalidDefault', { type: field.type });
  }
  if (field.type === 'number' && !Number.isFinite(Number(raw.trim()))) {
    return t('errors.validation.invalidDefault', { type: field.type });
  }
  if (field.type === 'boolean' && !/^(true|false)$/i.test(raw.trim())) {
    return t('errors.validation.invalidDefault', { type: field.type });
  }
  return null;
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

function defaultText(field: FrontmatterField): string | undefined {
  if (field.defaultValue !== undefined) {
    return field.defaultValue.trim() === '' ? undefined : field.defaultValue;
  }
  // 旧配置没有 defaultValue 时保持 draft: true 的新稿行为；显式清空后不再回退。
  return field.name === 'draft' && field.type === 'boolean' ? 'true' : undefined;
}

export function defaultValueForField(field: FrontmatterField): unknown {
  const raw = defaultText(field);
  if (raw === undefined) return undefined;
  switch (field.type) {
    case 'boolean':
      return /^true$/i.test(raw.trim());
    case 'number':
      return Number.isFinite(Number(raw.trim())) ? Number(raw.trim()) : undefined;
    case 'list':
      return parseListValue(field, raw);
    case 'text':
      return raw;
    default:
      return raw.trim();
  }
}

export function isFormValueEmpty(field: FrontmatterField, value: FrontmatterFormValue): boolean {
  if (field.type === 'boolean') return false;
  return (typeof value === 'string' ? value : '').trim() === '';
}

/**
 * Source mode writes the file as typed and never runs form validation; this only
 * backs the non-blocking "缺少必填" hint. Required booleans are never missing.
 */
export function missingRequiredFieldNames(fields: readonly FrontmatterField[], data: Record<string, unknown>): string[] {
  return fields
    .filter((field) => field.required && field.type !== 'boolean')
    .filter((field) => isFormValueEmpty(field, valueToDisplay(field, data[field.name])))
    .map((field) => field.name);
}

/**
 * 新建文章对话框只在 title 是可写入的必填 string 字段时显示标题输入框。
 * 非 string 的 title 不会被 buildNewPostDocument 写入，按不可用处理。
 */
export function hasRequiredTitleField(fields: readonly FrontmatterField[]): boolean {
  return fields.some((field) => field.name === 'title' && field.type === 'string' && field.required);
}

function validateFieldValue(field: FrontmatterField, value: FrontmatterFormValue): string | null {
  if (field.type === 'boolean') return null;
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return field.required ? t('errors.validation.requiredValue') : null;
  }
  if (field.type === 'date' && !DATE_RE.test(text)) {
    return t('errors.validation.invalidDate');
  }
  if (field.type === 'number' && !Number.isFinite(Number(text))) {
    return t('errors.validation.invalidNumber');
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
  /**
   * Source mode is a whole-file buffer: invalid or required-but-empty fields are
   * treated as empty instead of blocking the switch. An existing key is removed.
   */
  invalidAsEmpty?: boolean;
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
      if (options.invalidAsEmpty) {
        if (original !== undefined) patch[field.name] = null;
        continue;
      }
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
      continue;
    }
    if (field.name === 'date' && field.type === 'date') {
      lines.push(...serializeFieldLines(field.name, input.date));
      continue;
    }
    const value = defaultValueForField(field);
    if (value !== undefined) {
      lines.push(...serializeFieldLines(field.name, value));
    }
  }
  if (lines.length === 0) return '';
  return `---\n${lines.join('\n')}\n---\n\n`;
}

export function knownFieldHint(name: string): string | undefined {
  const hint = KNOWN_BLOG_FIELDS[name.trim()]?.hint;
  return hint ? t(hint) : undefined;
}
