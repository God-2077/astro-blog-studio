import { FALLBACK_LOCALE, type Locale } from './locale';
import { getCurrentLocale } from './locale-state';
import { catalogFor, type MessageKey, type Messages } from './messages';
import type { MessageTree, PluralForms, TranslateParams } from './types';

function isPluralForms(value: unknown): value is PluralForms {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.one === 'string' && typeof candidate.other === 'string';
}

function resolve(tree: Messages | MessageTree | undefined, key: string): string | PluralForms | undefined {
  if (!tree) return undefined;
  let node: unknown = tree;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (isPluralForms(node)) return node;
  return undefined;
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match: string, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

function selectPlural(locale: Locale, forms: PluralForms, params?: TranslateParams): string {
  const count = typeof params?.count === 'number' ? params.count : Number(params?.count);
  if (!Number.isFinite(count)) return forms.other;
  try {
    return new Intl.PluralRules(locale).select(count) === 'one' ? forms.one : forms.other;
  } catch {
    return forms.other;
  }
}

/** 渲染一条已取出的文案：复数按语言选形，再替换已知占位符。 */
export function renderMessage(locale: Locale, value: string | PluralForms, params?: TranslateParams): string {
  const template = typeof value === 'string' ? value : selectPlural(locale, value, params);
  return interpolate(template, params);
}

/**
 * 按语言取词条并插值；未知占位符保持原样。
 * 缺少词条时回退简体中文，再回退键名本身，避免界面出现空串。
 */
export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const value =
    resolve(catalogFor(locale), key) ?? resolve(catalogFor(FALLBACK_LOCALE), key) ?? resolve(catalogFor('zh-CN'), key);
  if (value === undefined) return key;
  return renderMessage(locale, value, params);
}

/** 非 React 代码（错误、校验、toast）使用当前生效语言。 */
export function t(key: MessageKey, params?: TranslateParams): string {
  return translate(getCurrentLocale(), key, params);
}
