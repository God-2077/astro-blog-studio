import { useEffect } from 'react';
import { applyDocumentLang } from '@/lib/i18n/locale';
import { setCurrentLocale } from '@/lib/i18n/locale-state';
import { useActiveLocale } from '@/lib/i18n/react';

/**
 * 把语言设置同步到全局翻译状态与 <html lang>。
 * 首帧由 main.tsx 的 initI18n 先应用一次；这里负责后续切换。
 */
export function LocaleSync(): null {
  const locale = useActiveLocale();

  useEffect(() => {
    setCurrentLocale(locale);
    applyDocumentLang(locale);
  }, [locale]);

  return null;
}
