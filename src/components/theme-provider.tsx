import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { DARK_MEDIA_QUERY, type ResolvedTheme, resolveTheme, THEME_COLORS } from '@/lib/theme/theme';
import { useSettings } from '@/stores/settings';

const ResolvedThemeContext = createContext<ResolvedTheme>('day');

/**
 * 把主题偏好解析成 day / night，并同步到 <html data-theme>。
 * 首帧由 index.html 的内联脚本先应用一次（防白闪）；这里负责后续切换与系统偏好变化。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSettings((state) => state.appearance.theme);
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia(DARK_MEDIA_QUERY).matches);

  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = (): void => setPrefersDark(media.matches);
    setPrefersDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const theme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme === 'night' ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  }, [theme]);

  return <ResolvedThemeContext.Provider value={theme}>{children}</ResolvedThemeContext.Provider>;
}

export function useResolvedTheme(): ResolvedTheme {
  return useContext(ResolvedThemeContext);
}
