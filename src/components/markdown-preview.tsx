import { useEffect, useRef } from 'react';
import { codeLanguageLabel, parseFenceLanguage } from '@/lib/markdown/code-language';
import { highlightCode } from '@/lib/markdown/highlight';

/** 一屏预览里最多着色多少个代码块，避免超长文档一次排队太多任务。 */
const MAX_BLOCKS = 30;
/** 输入过程中合并多次着色：React 每次按键都会重写预览 DOM。 */
const HIGHLIGHT_DELAY = 90;

/**
 * Markdown 预览。
 *
 * 先用 sanitize 过的 HTML 渲染，再对 `pre > code` 做渐进增强式着色：
 * shiki 只有在预览里真的出现代码块时才被动态加载，文章没有代码块时
 * 不会为首屏增加任何体积。着色结果只写入 span，文本仍由 shiki 转义。
 */
export function MarkdownPreview({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !html) return;

    let cancelled = false;
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('pre > code')).slice(0, MAX_BLOCKS);
    if (!blocks.length) return;

    const decorate = () => {
      for (const code of blocks) {
        const pre = code.parentElement;
        const source = code.textContent ?? '';
        if (!pre || !source.trim()) continue;

        void highlightCode(source, parseFenceLanguage(code.className))
          .then((result) => {
            if (cancelled || !result.html || !result.language || !code.isConnected) return;
            const label = codeLanguageLabel(result.language);
            code.innerHTML = result.html;
            pre.dataset.lang = label;
            pre.classList.add('abs-code-block');
            // 自动识别的块用 title 说明来源；作者自己写的语言标签不需要重复提示。
            if (result.source === 'detected') pre.title = `自动识别：${label}`;
            else pre.removeAttribute('title');
          })
          .catch(() => {
            // 高亮是渐进增强：失败时保留纯文本代码块。
          });
      }
    };

    const timer = window.setTimeout(decorate, HIGHLIGHT_DELAY);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [html]);

  return <div ref={containerRef} className="abs-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}
