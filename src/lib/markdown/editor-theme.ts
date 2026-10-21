import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/**
 * Markdown 源码的语法色。颜色只引用 --abs-md-* 角色 token，
 * 昼/夜切换由 app.css 的变量完成，不在这里复制第二套颜色。
 *
 * 规则顺序就是 CSS 优先级：先通用内容，再具体节点，最后标点。
 * 标记节点（如 HeaderMark）会同时带父节点与 processingInstruction 两个类，
 * 因此标点规则放在最后，才能覆盖父节点的颜色。
 */
export const markdownHighlightStyle = HighlightStyle.define([
  {
    tag: tags.heading,
    color: 'var(--abs-md-heading)',
    fontWeight: '700',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
  { tag: tags.quote, color: 'var(--abs-md-muted)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  {
    tag: tags.link,
    color: 'var(--abs-md-link)',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  { tag: tags.monospace, color: 'var(--abs-md-code)' },
  { tag: tags.comment, color: 'var(--abs-md-muted)', fontStyle: 'italic' },
  { tag: [tags.string, tags.character], color: 'var(--abs-md-string)' },
  { tag: tags.escape, color: 'var(--abs-md-string)' },
  { tag: tags.atom, color: 'var(--abs-md-code)' },
  { tag: tags.url, color: 'var(--abs-md-link)' },
  { tag: tags.labelName, color: 'var(--abs-md-code)' },
  { tag: tags.contentSeparator, color: 'var(--abs-md-rule)', fontWeight: '700' },
  { tag: tags.processingInstruction, color: 'var(--abs-md-muted)' },
  { tag: tags.invalid, color: 'var(--abs-danger)' },
]);

/**
 * 稳定的扩展数组：Markdown 语言 + 软换行 + 自定义高亮。
 * 主题色通过 CSS 变量跟随 data-theme，不需要在切换主题时重建。
 */
export const markdownEditorExtensions: Extension[] = [
  markdown(),
  EditorView.lineWrapping,
  syntaxHighlighting(markdownHighlightStyle),
];

export function createEditorTheme(fontSize: number, dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        color: 'var(--abs-ink)',
        fontSize: `${fontSize}px`,
      },
      '.cm-scroller': { fontFamily: 'var(--abs-font-mono)', lineHeight: '1.9' },
      '.cm-content': { padding: '10px 0' },
      '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--abs-muted)' },
      '.cm-activeLine': { backgroundColor: 'var(--abs-active-line)' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--abs-active-line)' },
      '.cm-selectionMatch': { backgroundColor: 'var(--abs-blush-2)' },
      '.cm-cursor': { borderLeftColor: 'var(--abs-sakura)' },
      '&.cm-focused': { outline: 'none' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--abs-selection) !important',
      },
    },
    { dark },
  );
}
