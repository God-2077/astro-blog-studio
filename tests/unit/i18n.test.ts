// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/config/defaults';
import { settingsSchema } from '@/lib/config/schema';
import {
  applyDocumentLang,
  detectLocale,
  LOCALE_LABELS,
  LOCALES,
  type Locale,
  type MessageKey,
  normalizeLocale,
  setCurrentLocale,
  t,
  translate,
} from '@/lib/i18n';
import { initI18n } from '@/lib/i18n/bootstrap';
import { catalogFor } from '@/lib/i18n/messages';
import { useT } from '@/lib/i18n/react';
import { renderMessage } from '@/lib/i18n/translate';
import type { PluralForms } from '@/lib/i18n/types';
import { useSettings } from '@/stores/settings';

type Leaf = string | PluralForms;

function isPluralForms(value: unknown): value is PluralForms {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.one === 'string' && typeof candidate.other === 'string';
}

function flatten(tree: unknown, prefix = '', out = new Map<string, Leaf>()): Map<string, Leaf> {
  if (!tree || typeof tree !== 'object') return out;
  for (const [key, value] of Object.entries(tree as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string' || isPluralForms(value)) {
      out.set(path, value);
    } else if (value && typeof value === 'object') {
      flatten(value, path, out);
    }
  }
  return out;
}

function templates(leaf: Leaf): string[] {
  return typeof leaf === 'string' ? [leaf] : [leaf.one, leaf.other];
}

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

function resetLocale(): void {
  setCurrentLocale('zh-CN');
  const appearance = { ...useSettings.getState().appearance };
  delete appearance.locale;
  useSettings.getState().patch({ appearance });
}

afterEach(() => {
  cleanup();
  resetLocale();
});

describe('normalizeLocale', () => {
  it('maps supported Chinese variants to the right script', () => {
    for (const tag of ['zh', 'zh-CN', 'zh-cn', 'zh-SG', 'zh-Hans', 'zh-hans-CN', 'ZH_cn']) {
      expect(normalizeLocale(tag), tag).toBe('zh-CN');
    }
    for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-hant-TW', 'zh_tw']) {
      expect(normalizeLocale(tag), tag).toBe('zh-TW');
    }
  });

  it('maps Japanese and English while rejecting everything else', () => {
    expect(normalizeLocale('ja')).toBe('ja');
    expect(normalizeLocale('ja-JP')).toBe('ja');
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('en-US')).toBe('en');
    for (const tag of ['de-DE', 'fr', 'ko-KR', 'ru-RU', '']) {
      expect(normalizeLocale(tag), tag).toBeNull();
    }
    expect(normalizeLocale(null)).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();
  });
});

describe('detectLocale', () => {
  it('uses the first supported browser language', () => {
    expect(detectLocale(['de-DE', 'ja-JP'])).toBe('ja');
    expect(detectLocale(['fr-FR', 'zh-HK'])).toBe('zh-TW');
    expect(detectLocale(['en-GB'])).toBe('en');
  });

  it('falls back to English for unsupported or empty language lists', () => {
    expect(detectLocale(['de-DE', 'fr-FR', 'ko-KR'])).toBe('en');
    expect(detectLocale([])).toBe('en');
    // null 表示没有显式列表：回退到 navigator，tests/setup.ts 固定为 zh-CN。
    expect(detectLocale(null)).toBe('zh-CN');
  });

  it('reads navigator languages when no list is passed', () => {
    // tests/setup.ts fixes navigator.language to zh-CN for deterministic assertions.
    expect(detectLocale()).toBe('zh-CN');
  });
});

describe('locale metadata', () => {
  it('shows every language in its own name', () => {
    expect(LOCALE_LABELS).toEqual({
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      ja: '日本語',
      en: 'English',
    });
    expect(LOCALES).toEqual(['zh-CN', 'zh-TW', 'ja', 'en']);
  });

  it('applies html lang and ltr direction', () => {
    applyDocumentLang('ja');
    expect(document.documentElement.lang).toBe('ja');
    expect(document.documentElement.dir).toBe('ltr');
  });
});

describe('catalogs', () => {
  it('has one complete catalog per locale, with matching keys and placeholders', () => {
    const base = catalogFor('zh-CN');
    expect(base).toBeDefined();
    if (!base) return;
    const baseLeaves = flatten(base);
    expect(baseLeaves.size).toBeGreaterThan(0);

    for (const locale of LOCALES) {
      const catalog = catalogFor(locale);
      expect(catalog, locale).toBeDefined();
      if (!catalog) continue;
      const leaves = flatten(catalog);
      expect([...leaves.keys()].sort(), locale).toEqual([...baseLeaves.keys()].sort());

      for (const [key, baseLeaf] of baseLeaves) {
        const leaf = leaves.get(key);
        expect(leaf, `${locale}:${key}`).toBeDefined();
        if (leaf === undefined) continue;
        const baseTemplates = templates(baseLeaf);
        const leafTemplates = templates(leaf);
        expect(leafTemplates.length, `${locale}:${key} plural shape`).toBe(baseTemplates.length);
        for (const [index, template] of leafTemplates.entries()) {
          expect(template.trim().length, `${locale}:${key} empty message`).toBeGreaterThan(0);
          expect(placeholders(template), `${locale}:${key} placeholders`).toEqual(placeholders(baseTemplates[index] ?? ''));
        }
      }
    }
  });
});

describe('translate', () => {
  it('interpolates known placeholders and keeps unknown ones intact', () => {
    expect(translate('zh-CN', 'errors.vault.passwordTooShort', { count: 8 })).toBe('密码至少 8 位');
    expect(translate('zh-CN', 'errors.validation.reservedName', { name: 'title' })).toBe('字段名 title 是保留名');
    expect(translate('zh-CN', 'errors.live.fileTooLarge')).toContain('{count}');
  });

  it('selects plural forms with Intl.PluralRules', () => {
    // 用独立的复数形状测机制：英语 count=1 取 one，count=2 取 other；缺失 count 取 other。
    const forms = { one: '{count} item', other: '{count} items' };
    expect(renderMessage('en', forms, { count: 1 })).toBe('1 item');
    expect(renderMessage('en', forms, { count: 2 })).toBe('2 items');
    expect(renderMessage('en', forms)).toBe('{count} items');
    // 中文/日文没有单复数区分，走 other。
    expect(renderMessage('zh-CN', forms, { count: 1 })).toBe('1 items');
    expect(renderMessage('ja', forms, { count: 2 })).toBe('2 items');

    expect(translate('zh-CN', 'common.units.words', { count: 1 })).toBe('1 字');
    expect(translate('zh-CN', 'common.units.words', { count: 2 })).toBe('2 字');
    expect(translate('zh-CN', 'common.units.words')).toContain('{count}');

    for (const locale of ['ja', 'zh-TW'] as const) {
      expect(translate(locale, 'common.units.words', { count: 1 })).toContain('1');
      expect(translate(locale, 'common.units.words', { count: 2 })).toContain('2');
    }
  });

  it('falls back to the key itself for a missing message', () => {
    expect(translate('en', 'missing.message' as MessageKey)).toBe('missing.message');
  });

  it('uses the current locale for leaf t()', () => {
    setCurrentLocale('en');
    expect(t('common.cancel')).toBe(translate('en', 'common.cancel'));
    expect(t('common.cancel')).not.toBe('取消');

    setCurrentLocale('zh-CN');
    expect(t('common.cancel')).toBe('取消');
  });
});

describe('initI18n', () => {
  it('prefers the stored locale and syncs html lang', () => {
    useSettings.getState().patch({
      appearance: { ...useSettings.getState().appearance, locale: 'ja' },
    });
    expect(initI18n()).toBe('ja');
    expect(document.documentElement.lang).toBe('ja');
  });

  it('detects the browser locale when none is stored', () => {
    expect(initI18n()).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});

describe('useT', () => {
  it('re-renders with the new locale and updates leaf t() in the same render', () => {
    const { result } = renderHook(() => {
      const tHook = useT();
      return { value: tHook('common.cancel'), leaf: t('common.cancel') };
    });

    expect(result.current.value).toBe('取消');
    expect(result.current.leaf).toBe('取消');

    act(() => {
      useSettings.getState().patch({
        appearance: { ...useSettings.getState().appearance, locale: 'en' satisfies Locale },
      });
    });

    expect(result.current.value).toBe(translate('en', 'common.cancel'));
    expect(result.current.value).not.toBe('取消');
    // leaf t() must already see the new locale in this render, not one effect later.
    expect(result.current.leaf).toBe(result.current.value);
  });
});

describe('settings schema: locale', () => {
  it('accepts each supported locale', () => {
    for (const locale of LOCALES) {
      const parsed = settingsSchema.safeParse({
        ...defaultSettings,
        appearance: { ...defaultSettings.appearance, locale },
      });
      expect(parsed.success, locale).toBe(true);
      expect(parsed.success ? parsed.data.appearance.locale : null).toBe(locale);
    }
  });

  it('leaves the locale unset for settings persisted before the field existed', () => {
    const legacy = structuredClone(defaultSettings);
    const appearance: Partial<(typeof legacy)['appearance']> = { ...legacy.appearance };
    delete appearance.locale;

    const parsed = settingsSchema.safeParse({ ...legacy, appearance });
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.appearance.locale : 'invalid').toBeUndefined();
  });

  it('ignores an unknown persisted locale', () => {
    const parsed = settingsSchema.safeParse({
      ...defaultSettings,
      appearance: { ...defaultSettings.appearance, locale: 'de-DE' },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.appearance.locale : 'invalid').toBeUndefined();
  });
});
