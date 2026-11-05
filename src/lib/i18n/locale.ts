export const LOCALES = ['zh-CN', 'zh-TW', 'ja', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/** 不在四种界面语言内的浏览器语言回退到英语。 */
export const FALLBACK_LOCALE: Locale = 'en';

export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  en: 'English',
};

/** 把 BCP 47 语言标签收敛到四种界面语言之一；不支持的返回 null。 */
export function normalizeLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const lower = tag.trim().toLowerCase().replace(/_/g, '-');
  if (!lower) return null;
  if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh-sg' || lower.startsWith('zh-hans')) return 'zh-CN';
  if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo' || lower.startsWith('zh-hant')) return 'zh-TW';
  if (lower === 'ja' || lower.startsWith('ja-')) return 'ja';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  return null;
}

/** 依次匹配浏览器语言列表；跳过不支持的语言，全部不支持时回退英语。 */
export function detectLocale(languages?: readonly string[] | null): Locale {
  const list =
    languages ??
    (typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);
  for (const tag of list) {
    const match = normalizeLocale(tag);
    if (match) return match;
  }
  return FALLBACK_LOCALE;
}

/** 同步 <html lang> / dir，供首帧与语言切换共用。 */
export function applyDocumentLang(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dir = 'ltr';
}
