/**
 * 主题偏好：默认跟随系统，也可以手动固定在昼 / 夜。
 * 这里只做纯计算，不碰 DOM，方便单测；应用层由 ThemeSync 写入 <html data-theme>。
 */
export const THEME_PREFERENCES = ['system', 'day', 'night'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export type ResolvedTheme = 'day' | 'night';

export const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; hint: string }> = [
  { value: 'system', label: '跟随系统', hint: '系统深浅色变化时自动跟随' },
  { value: 'day', label: '昼', hint: '暖纸日间桌面' },
  { value: 'night', label: '夜', hint: '暖墨夜纸，不是纯黑反转' },
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
