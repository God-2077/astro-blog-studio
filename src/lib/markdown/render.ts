import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { escapeHtml } from './escape';
import { renderFencedCode } from './highlight';

const marked = new Marked({
  gfm: true,
  breaks: false,
});
marked.use(
  markedKatex({
    throwOnError: false,
    nonStandard: true,
  }),
);
marked.use({
  renderer: {
    code({ text, lang, escaped }) {
      return renderFencedCode(text, lang, escaped);
    },
  },
});

let hooksInstalled = false;

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noreferrer noopener');
    }
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy');
      node.setAttribute('decoding', 'async');
      node.setAttribute('referrerpolicy', 'no-referrer');
    }
  });
}

function transformSegment(segment: string): string {
  return segment
    .replace(/\{([^{}^.][^{}^]*)\^([^{}]+)\}/g, (_whole, base: string, annotation: string) =>
      annotation === '*'
        ? `<span class="md-emphasis">${escapeHtml(base)}</span>`
        : `<ruby>${escapeHtml(base)}<rt>${escapeHtml(annotation.replace(/^=/, ''))}</rt></ruby>`,
    )
    .replace(/!!([^!\s](?:[^!]*[^!\s])?)!!/g, (_whole, text: string) => `<span class="md-spoiler">${escapeHtml(text)}</span>`)
    .replace(/\+\+([^+\s](?:[^+]*[^+\s])?)\+\+/g, (_whole, text: string) => `<ins>${escapeHtml(text)}</ins>`)
    .replace(/==([^=\s](?:[^=]*[^=\s])?)==/g, (_whole, text: string) => `<mark>${escapeHtml(text)}</mark>`);
}

function transformInline(line: string): string {
  return line
    .split(/(`[^`]*`)/g)
    .map((part) => (part.startsWith('`') && part.endsWith('`') ? part : transformSegment(part)))
    .join('');
}

/** Shoka-ish inline syntax + ::: containers, without touching fenced code. */
export function preprocessShoka(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const containerOpen = /^:::([a-z][\w-]*)\s*$/.exec(line);
      if (containerOpen?.[1]) return `<div class="md-container md-container-${containerOpen[1]}">`;
      if (/^:::\s*$/.test(line)) return '</div>';
      return transformInline(line);
    })
    .join('\n');
}

export interface RenderResult {
  html: string;
  warnings: string[];
}

export function renderMarkdown(markdown: string): RenderResult {
  installHooks();
  const warnings: string[] = [];
  if (/<script\b/i.test(markdown)) warnings.push('预览已移除 <script> 标签');
  if (/<style\b/i.test(markdown)) warnings.push('预览已移除 <style> 标签');
  if (/\son[a-z]+\s*=/i.test(markdown)) warnings.push('预览已移除内联事件属性');

  const transformed = preprocessShoka(markdown);
  const raw = marked.parse(transformed, { async: false }) as string;
  const html = DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'rel', 'loading', 'decoding', 'referrerpolicy'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style', 'link', 'meta', 'base'],
  });
  return { html, warnings };
}
