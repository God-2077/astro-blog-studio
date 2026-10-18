import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/config/defaults';
import {
  clampIndexConcurrency,
  INDEX_CONCURRENCY_DEFAULT,
  INDEX_CONCURRENCY_MAX,
  INDEX_CONCURRENCY_MIN,
  settingsSchema,
} from '@/lib/config/schema';

function withConcurrency(value: unknown): unknown {
  return { ...defaultSettings, content: { ...defaultSettings.content, indexConcurrency: value } };
}

describe('index concurrency setting', () => {
  it('falls back to the default for settings saved before the field existed', () => {
    const legacyContent = { ...defaultSettings.content } as Record<string, unknown>;
    delete legacyContent.indexConcurrency;

    const parsed = settingsSchema.safeParse({ ...defaultSettings, content: legacyContent });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.content.indexConcurrency : null).toBe(INDEX_CONCURRENCY_DEFAULT);
  });

  it('keeps a valid persisted value', () => {
    const parsed = settingsSchema.safeParse(withConcurrency(7));

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.content.indexConcurrency : null).toBe(7);
  });

  it('falls back instead of rejecting when the persisted value is out of range or junk', () => {
    for (const value of [0, 11, -2, 4.5, 'fast', null]) {
      const parsed = settingsSchema.safeParse(withConcurrency(value));
      expect(parsed.success, `value ${String(value)}`).toBe(true);
      expect(parsed.success ? parsed.data.content.indexConcurrency : null).toBe(INDEX_CONCURRENCY_DEFAULT);
    }
  });

  it('clamps values typed into the settings form', () => {
    expect(clampIndexConcurrency(0)).toBe(INDEX_CONCURRENCY_MIN);
    expect(clampIndexConcurrency(-4)).toBe(INDEX_CONCURRENCY_MIN);
    expect(clampIndexConcurrency(99)).toBe(INDEX_CONCURRENCY_MAX);
    expect(clampIndexConcurrency(4.9)).toBe(4);
    expect(clampIndexConcurrency(Number.NaN)).toBe(INDEX_CONCURRENCY_DEFAULT);
  });
});
