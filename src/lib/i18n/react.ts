import { useCallback } from 'react';
import { useSettings } from '@/stores/settings';
import { detectLocale, type Locale } from './locale';
import { setCurrentLocale } from './locale-state';
import type { MessageKey } from './messages';
import { translate } from './translate';
import type { TranslateParams } from './types';

export type TFunction = (key: MessageKey, params?: TranslateParams) => string;

/**
 * 当前界面语言：显式设置优先，否则按浏览器语言检测。
 * 渲染期间同步全局语言，让同一帧里调用 leaf t() 的 helper（错误文案、草稿标题等）
 * 立刻用上新语言，而不是等到下一次 effect。
 */
export function useActiveLocale(): Locale {
  const stored = useSettings((state) => state.appearance.locale);
  const locale = stored ?? detectLocale();
  setCurrentLocale(locale);
  return locale;
}

/** 组件内取翻译函数；语言变化时重渲染并换用新词典。 */
export function useT(): TFunction {
  const locale = useActiveLocale();
  return useCallback((key: MessageKey, params?: TranslateParams) => translate(locale, key, params), [locale]);
}
