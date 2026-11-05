import { useSettings } from '@/stores/settings';
import { applyDocumentLang, detectLocale, type Locale } from './locale';
import { setCurrentLocale } from './locale-state';

/** 首次渲染前确定语言：显式设置优先，否则按浏览器检测（不支持的语言回退英语）。 */
export function initI18n(): Locale {
  const locale = useSettings.getState().appearance.locale ?? detectLocale();
  setCurrentLocale(locale);
  applyDocumentLang(locale);
  return locale;
}
