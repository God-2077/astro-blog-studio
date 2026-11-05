import { detectLocale, type Locale } from './locale';

/** 当前生效的界面语言：非 React 代码（错误翻译、校验）通过 getCurrentLocale 读取。 */
let currentLocale: Locale | null = null;

export function setCurrentLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getCurrentLocale(): Locale {
  return currentLocale ?? detectLocale();
}
