import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/lib/config/defaults';
import { type Settings, settingsSchema } from '@/lib/config/schema';

describe('settings schema: backupUnsaved', () => {
  it('defaults to true for settings persisted before the field existed', () => {
    const legacy = structuredClone(defaultSettings);
    const editor: Partial<Settings['editor']> = { ...legacy.editor };
    delete editor.backupUnsaved;

    const parsed = settingsSchema.safeParse({ ...legacy, editor });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.editor.backupUnsaved).toBe(true);
  });

  it('keeps an explicit false', () => {
    const parsed = settingsSchema.safeParse({
      ...defaultSettings,
      editor: { ...defaultSettings.editor, backupUnsaved: false },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.editor.backupUnsaved).toBe(false);
  });
});
