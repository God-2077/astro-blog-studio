import { describe, expect, it } from 'vitest';
import { resolveUnlockReturn, UNLOCK_RETURN_FALLBACK, unlockReturnState } from '@/lib/navigation/unlock-return';

describe('unlockReturnState', () => {
  it('records the current pathname and search', () => {
    expect(unlockReturnState({ pathname: '/edit', search: '?path=code.md' })).toEqual({ from: '/edit?path=code.md' });
    expect(unlockReturnState({ pathname: '/settings', search: '' })).toEqual({ from: '/settings' });
  });
});

describe('resolveUnlockReturn', () => {
  it('returns safe internal paths unchanged', () => {
    for (const from of ['/', '/edit?path=code.md', '/settings']) {
      expect(resolveUnlockReturn({ from })).toBe(from);
    }
  });

  it('falls back for missing or malformed state', () => {
    const states: unknown[] = [
      undefined,
      null,
      {},
      { from: 42 },
      { from: 'edit' },
      { from: '//evil.example' },
      { from: 'https://evil.example' },
    ];
    for (const state of states) expect(resolveUnlockReturn(state)).toBe(UNLOCK_RETURN_FALLBACK);
  });

  it('never returns to the unlock page or accepts dangerous strings', () => {
    const values = ['/unlock', '/unlock/', '/unlock?x=1', '/edit\\path', '/edit\u0000', `/${'a'.repeat(2048)}`];
    for (const from of values) expect(resolveUnlockReturn({ from })).toBe(UNLOCK_RETURN_FALLBACK);
  });
});
