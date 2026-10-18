import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, decodeUtf8, encodeUtf8, hasReplacementChars } from '@/lib/utils/encoding';

describe('utf-8 and base64 helpers', () => {
  it('round-trips CJK text through base64', () => {
    const text = '便笺：Markdown 备忘单\n第二行';
    const bytes = encodeUtf8(text);
    expect(decodeUtf8(base64ToBytes(bytesToBase64(bytes)))).toBe(text);
  });

  it('handles a large payload without stack overflow', () => {
    const text = 'a'.repeat(500_000);
    const encoded = bytesToBase64(encodeUtf8(text));
    expect(decodeUtf8(base64ToBytes(encoded))).toBe(text);
  });

  it('detects replacement characters', () => {
    expect(hasReplacementChars('ok')).toBe(false);
    expect(hasReplacementChars('bad \uFFFD')).toBe(true);
  });
});
