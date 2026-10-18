import { describe, expect, it } from 'vitest';
import {
  composeDocument,
  composeSourceDocument,
  detectMeta,
  parseDocument,
  toEditingText,
  updateFrontmatterRaw,
} from '@/lib/markdown/document';

describe('frontmatter document handling', () => {
  it('parses LF documents and keeps unknown fields', () => {
    const parsed = parseDocument(
      "---\ntitle: '便笺'\ndate: '2024-07-21 20:10:28'\ncategories:\n- 笔记\nlegacy_key: keep-me\n---\n\n## Body\n",
    );
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.data.title).toBe('便笺');
    expect(parsed.data.legacy_key).toBe('keep-me');
    expect(parsed.body).toContain('## Body');
    expect(parsed.meta.eol).toBe('\n');
    expect(parsed.frontmatterError).toBeUndefined();
  });

  it('detects CRLF and BOM', () => {
    const meta = detectMeta('\uFEFF---\r\ntitle: x\r\n---\r\n\r\nbody\r\n');
    expect(meta.bom).toBe(true);
    expect(meta.eol).toBe('\r\n');
    expect(meta.trailingNewline).toBe(true);
  });

  it('updates only requested keys and preserves comments and unknown lines', () => {
    const raw = "title: 'old'\n# a comment\ndate: '2024-07-21 20:10:28'\ncategories:\n- 笔记\nlegacy_key: keep-me";
    const next = updateFrontmatterRaw(raw, { title: 'new title', tags: ['a', 'b'] });
    expect(next).toContain('# a comment');
    expect(next).toContain('legacy_key: keep-me');
    expect(next).toContain('title: new title');
    expect(next).toContain('tags:\n- a\n- b');
    expect(next).toContain("date: '2024-07-21 20:10:28'");
  });

  it('round-trips CRLF and trailing newline through compose', () => {
    const input = "---\r\ntitle: 'x'\r\ndate: '2024-07-21 20:10:28'\r\n---\r\n\r\nbody\r\n";
    const parsed = parseDocument(input);
    const composed = composeDocument({
      meta: parsed.meta,
      frontmatterRaw: parsed.frontmatterRaw,
      body: parsed.body,
      includeFrontmatter: true,
    });
    expect(composed).toBe(input);
  });

  it('reports invalid YAML instead of throwing', () => {
    const parsed = parseDocument('---\ntitle: [unclosed\n---\n\nbody');
    expect(parsed.frontmatterError).toBeTruthy();
    expect(parsed.frontmatterRaw).toContain('unclosed');
  });

  it('quotes date strings and escapes single quotes', () => {
    const next = updateFrontmatterRaw("title: 'x'", { title: "it's a title", date: '2026-01-01 00:00:00' });
    expect(next).toContain("title: 'it''s a title'");
    expect(next).toContain("date: '2026-01-01 00:00:00'");
  });

  it('removes a key block when the patch value is null', () => {
    const raw = "title: 'x'\n# keep this\ntags:\n- a\n- b\nlegacy: keep";
    const next = updateFrontmatterRaw(raw, { tags: null });
    expect(next).not.toContain('tags:');
    expect(next).not.toContain('- a');
    expect(next).toContain('# keep this');
    expect(next).toContain('legacy: keep');
    expect(updateFrontmatterRaw(raw, { missing: null })).toBe(raw);
  });
});

describe('source mode document handling', () => {
  const crlfWithBom = { eol: '\r\n', mixed: false, bom: true, trailingNewline: true } as const;

  it('writes the whole buffer back apart from BOM and EOL', () => {
    const buffer = "---\ntitle: 'x'\n# keep this comment\nlegacy_key:\n- a\n  - b\n---\n\n\nbody  \n\n\n";
    const written = composeSourceDocument({ text: buffer, meta: crlfWithBom });
    expect(written).toBe(`\uFEFF${buffer.replaceAll('\n', '\r\n')}`);
    expect(written.endsWith('\r\n\r\n\r\n')).toBe(true);
    expect(composeSourceDocument({ text: buffer, meta: { ...crlfWithBom, bom: false, eol: '\n' } })).toBe(buffer);
  });

  it('never adds or trims a trailing newline', () => {
    const meta = { eol: '\n', mixed: false, bom: false, trailingNewline: true } as const;
    expect(composeSourceDocument({ text: '---\ntitle: x\n---', meta })).toBe('---\ntitle: x\n---');
    expect(composeSourceDocument({ text: 'body', meta })).toBe('body');
  });

  it('unifies stray line endings in the buffer to the file EOL', () => {
    const meta = { eol: '\n', mixed: true, bom: false, trailingNewline: true } as const;
    expect(composeSourceDocument({ text: 'a\r\nb\nc', meta })).toBe('a\nb\nc');
  });

  it('strips BOM and CRLF when seeding the editor buffer', () => {
    expect(toEditingText('\uFEFF---\r\ntitle: x\r\n---\r\n')).toBe('---\ntitle: x\n---\n');
    expect(toEditingText("title: 'x'")).toBe("title: 'x'");
  });

  it('round-trips a CRLF document through source mode write-back', () => {
    const original = "---\r\ntitle: 'x'\r\ntags:\r\n- a\r\n---\r\n\r\nbody\r\n";
    const written = composeSourceDocument({ text: toEditingText(original), meta: detectMeta(original) });
    expect(written).toBe(original);
  });
});
