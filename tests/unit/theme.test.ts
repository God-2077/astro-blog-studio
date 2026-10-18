import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/config/defaults';
import { settingsSchema } from '@/lib/config/schema';
import { resolveTheme, THEME_OPTIONS, THEME_PREFERENCES } from '@/lib/theme/theme';

describe('resolveTheme', () => {
  it('uses the manual choice regardless of the system preference', () => {
    expect(resolveTheme('night', false)).toBe('night');
    expect(resolveTheme('day', true)).toBe('day');
  });

  it('follows prefers-color-scheme when set to system', () => {
    expect(resolveTheme('system', true)).toBe('night');
    expect(resolveTheme('system', false)).toBe('day');
  });

  it('exposes one option per preference, with system first', () => {
    expect(THEME_OPTIONS.map((option) => option.value)).toEqual([...THEME_PREFERENCES]);
    expect(THEME_OPTIONS[0]?.value).toBe('system');
  });
});

describe('appearance settings', () => {
  it('migrates the legacy native value to system', () => {
    const parsed = settingsSchema.safeParse({
      ...defaultSettings,
      appearance: { ...defaultSettings.appearance, theme: 'native' },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.appearance.theme : null).toBe('system');
  });

  it('accepts manual day and night choices', () => {
    for (const theme of ['day', 'night'] as const) {
      const parsed = settingsSchema.safeParse({
        ...defaultSettings,
        appearance: { ...defaultSettings.appearance, theme },
      });
      expect(parsed.success).toBe(true);
      expect(parsed.success ? parsed.data.appearance.theme : null).toBe(theme);
    }
  });

  it('falls back to system for unknown persisted values', () => {
    const parsed = settingsSchema.safeParse({
      ...defaultSettings,
      appearance: { ...defaultSettings.appearance, theme: 'auto-magic' },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.appearance.theme : null).toBe('system');
  });
});
