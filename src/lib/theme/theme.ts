import type { MessageKey } from '@/lib/i18n/messages';

/**
 * 主题偏好：默认跟随系统，也可以手动固定在昼 / 夜。
 * 这里只做纯计算，不碰 DOM，方便单测；应用层由 ThemeSync 写入 <html data-theme>。
 */
export const THEME_PREFERENCES = ['system', 'day', 'night'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export type ResolvedTheme = 'day' | 'night';

export interface ThemeOption {
  value: ThemePreference;
  labelKey: MessageKey;
  hintKey: MessageKey;
}

export const THEME_OPTIONS: ReadonlyArray<ThemeOption> = [
  {
    value: 'system',
    labelKey: 'common.theme.system.label',
    hintKey: 'common.theme.system.hint',
  },
  {
    value: 'day',
    labelKey: 'common.theme.day.label',
    hintKey: 'common.theme.day.hint',
  },
  {
    value: 'night',
    labelKey: 'common.theme.night.label',
    hintKey: 'common.theme.night.hint',
  },
];

/** 与 CSS 和 index.html 内联脚本保持一致。 */
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/** 移动端浏览器地址栏颜色（meta theme-color）。 */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  day: '#FFFBF5',
  night: '#100B0E',
};

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'night') return 'night';
  if (preference === 'day') return 'day';
  return prefersDark ? 'night' : 'day';
}
