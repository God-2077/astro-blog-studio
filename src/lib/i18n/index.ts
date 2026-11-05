export {
  applyDocumentLang,
  detectLocale,
  FALLBACK_LOCALE,
  LOCALE_LABELS,
  LOCALES,
  type Locale,
  normalizeLocale,
} from './locale';
export { getCurrentLocale, setCurrentLocale } from './locale-state';
export type { MessageKey, Messages } from './messages';
export { t, translate } from './translate';
export type { DeepMessageKey, MessageTree, PluralForms, TranslateParams } from './types';
