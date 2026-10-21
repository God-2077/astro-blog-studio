// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownPreview } from '@/components/markdown-preview';
import { renderMarkdown } from '@/lib/markdown/render';

function preview(markdown: string) {
  return render(<MarkdownPreview html={renderMarkdown(markdown).html} />);
}

describe('markdown preview code blocks', () => {
  it('adds highlighted tokens and a language label to a fenced block', async () => {
    const { container } = preview('```js\nconst answer = 42;\n```');

    await waitFor(
      () => {
        expect(container.querySelector('pre')?.dataset.lang).toBe('JavaScript');
      },
      { timeout: 5_000 },
    );

    const pre = container.querySelector('pre');
    expect(pre?.classList.contains('abs-code-block')).toBe(true);
    expect(pre?.hasAttribute('title')).toBe(false);
    expect(container.querySelector('code')?.innerHTML).toContain('style="color:');
  });

  it('auto-detects a fence without a language and says so', async () => {
    const { container } = preview('```\n{"ok": true, "n": 2}\n```');

    await waitFor(
      () => {
        expect(container.querySelector('pre')?.dataset.lang).toBe('JSON');
      },
      { timeout: 5_000 },
    );

    expect(container.querySelector('pre')?.getAttribute('title')).toBe('自动识别：JSON');
  });

  it('leaves plaintext and unknown fences untouched', async () => {
    const { container } = preview('```text\n{"ok": true}\n```\n\n```nope\nhello: world\n```');
    // 两个块都不该被装饰；给异步高亮一点时间确认它确实什么都没做。
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(container.querySelectorAll('pre.abs-code-block')).toHaveLength(0);
    expect(container.querySelector('pre')?.hasAttribute('data-lang')).toBe(false);
  });
});
