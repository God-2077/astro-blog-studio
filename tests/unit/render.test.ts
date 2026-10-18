// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/lib/markdown/render';

describe('markdown preview', () => {
  it('renders GFM and sanitizes dangerous HTML', () => {
    const { html } = renderMarkdown(
      '## 标题\n\n**粗体**\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))',
    );
    expect(html).toContain('<h2');
    expect(html).toContain('<strong>粗体</strong>');
    expect(html).toContain('<table>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });

  it('renders shoka inline syntax', () => {
    const { html } = renderMarkdown('!!剧透!!\n\n++插入++\n\n==高亮==\n\n{漢字^かんじ}');
    expect(html).toContain('md-spoiler');
    expect(html).toContain('<ins>');
    expect(html).toContain('<mark>');
    expect(html).toContain('<ruby>');
  });

  it('renders a ::: container', () => {
    const { html } = renderMarkdown(':::info\nhello\n:::\n');
    expect(html).toContain('md-container');
    expect(html).toContain('hello');
  });

  it('adds safe link attributes and image referrer policy', () => {
    const { html } = renderMarkdown('[link](https://example.com)\n\n![alt](https://example.com/a.png)');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('referrerpolicy="no-referrer"');
  });

  it('does not execute code inside fenced blocks', () => {
    const { html } = renderMarkdown('```\n!!not a spoiler!!\n```\n');
    expect(html).toContain('not a spoiler');
    expect(html).not.toContain('md-spoiler');
  });
});
