import { describe, expect, it } from 'vitest';
import { highlightCode } from '@/lib/markdown/highlight';

describe('preview code highlighting', () => {
  it('highlights an explicit fence language', async () => {
    const result = await highlightCode('const answer = 42;', 'js');
    expect(result.language).toBe('javascript');
    expect(result.source).toBe('fence');
    expect(result.html).toContain('style="color:');
    expect(result.html).toContain('answer');
  });

  it('escapes markup instead of injecting it', async () => {
    const result = await highlightCode('const html = "<img src=x onerror=alert(1)>";', 'javascript');
    expect(result.html).not.toBeNull();
    expect(result.html).not.toContain('<img');
    expect(result.html).toContain('&#x3C;img');
  });

  it('auto-detects when the fence has no language', async () => {
    const result = await highlightCode('{"ok": true, "n": 2}', null);
    expect(result.language).toBe('json');
    expect(result.source).toBe('detected');
    expect(result.html).toContain('style="color:');
  });

  it('respects plaintext fences without guessing', async () => {
    const result = await highlightCode('{"ok": true}', 'text');
    expect(result.html).toBeNull();
    expect(result.language).toBeNull();
  });

  it('keeps unknown languages plain', async () => {
    const result = await highlightCode('some words: here', 'not-a-language');
    expect(result.html).toBeNull();
    expect(result.language).toBeNull();
  });

  it('skips very large blocks but still reports the language', async () => {
    const result = await highlightCode(`const x = 1;\n// ${'a'.repeat(41_000)}`, 'javascript');
    expect(result.html).toBeNull();
    expect(result.language).toBe('javascript');
  });

  it('reuses the cached result for unchanged code', async () => {
    const first = await highlightCode('const cached = 1;', 'javascript');
    const second = await highlightCode('const cached = 1;', 'javascript');
    expect(second).toBe(first);
  });
});
