import type { ThemeRegistration } from 'shiki/core';

/**
 * 预览代码块的配色：深色「墨池」+ 站点樱粉/薄荷/黄油。
 *
 * 颜色不引用 CSS 变量——shiki 把 token 颜色内联进 span，主题必须是静态值。
 * 所有前景色对 `--abs-code-bg` 的昼（#2F2A2E）/夜（#171114）两档都对过
 * 对比度，最低的注释色是 5.05:1 / 6.68:1。
 */
const INK = '#f3e6ea';
const COMMENT = '#a9969c';
const SAKURA = '#f2a7c2';
const STRING = '#a8e0cf';
const NUMBER = '#f0cf8f';
const FUNCTION = '#ffd6a8';
const TYPE = '#9ecfe6';
const PUNCT = '#c3aeb6';
const PROPERTY = '#e8d5db';
const DANGER = '#ff8f7c';

export const ABS_CODE_THEME_NAME = 'abs-ink';

export const ABS_CODE_THEME: ThemeRegistration = {
  name: ABS_CODE_THEME_NAME,
  type: 'dark',
  colors: {
    'editor.background': '#00000000',
    'editor.foreground': INK,
  },
  tokenColors: [
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: COMMENT, fontStyle: 'italic' },
    },
    {
      scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control'],
      settings: { foreground: SAKURA },
    },
    {
      scope: ['keyword.operator', 'punctuation.definition.keyword'],
      settings: { foreground: PUNCT },
    },
    {
      scope: ['keyword.operator.expression', 'keyword.operator.new', 'keyword.operator.word'],
      settings: { foreground: SAKURA },
    },
    {
      scope: ['string', 'punctuation.definition.string', 'constant.other.symbol', 'markup.inline.raw.string'],
      settings: { foreground: STRING },
    },
    {
      scope: [
        'constant.numeric',
        'constant.language',
        'constant.character',
        'variable.language',
        'support.constant',
        'keyword.other.unit',
      ],
      settings: { foreground: NUMBER },
    },
    {
      scope: ['constant.other.color', 'constant.other.rgb-value', 'support.constant.property-value'],
      settings: { foreground: NUMBER },
    },
    {
      scope: ['entity.name.function', 'support.function', 'variable.function', 'meta.function-call', 'meta.decorator'],
      settings: { foreground: FUNCTION },
    },
    {
      scope: ['entity.name.type', 'entity.name.class', 'entity.other.inherited-class', 'support.type', 'support.class'],
      settings: { foreground: TYPE },
    },
    {
      scope: ['entity.name.namespace', 'entity.name.scope-resolution', 'variable.other.constant', 'variable.other.enummember'],
      settings: { foreground: TYPE },
    },
    {
      scope: ['entity.name.tag', 'punctuation.definition.tag', 'entity.name.tag.css'],
      settings: { foreground: SAKURA },
    },
    {
      scope: ['entity.other.attribute-name', 'support.type.property-name', 'entity.name.tag.yaml'],
      settings: { foreground: NUMBER },
    },
    {
      scope: ['meta.object-literal.key', 'variable', 'variable.parameter', 'variable.other', 'entity.name.variable'],
      settings: { foreground: PROPERTY },
    },
    {
      scope: ['punctuation', 'meta.brace', 'meta.delimiter', 'punctuation.separator'],
      settings: { foreground: PUNCT },
    },
    {
      scope: ['entity.name.section', 'markup.heading', 'punctuation.definition.heading'],
      settings: { foreground: SAKURA, fontStyle: 'bold' },
    },
    {
      scope: ['markup.bold', 'punctuation.definition.bold'],
      settings: { foreground: INK, fontStyle: 'bold' },
    },
    {
      scope: ['markup.italic', 'punctuation.definition.italic'],
      settings: { foreground: INK, fontStyle: 'italic' },
    },
    {
      scope: ['markup.underline.link', 'string.other.link', 'meta.link'],
      settings: { foreground: STRING, fontStyle: 'underline' },
    },
    {
      scope: ['markup.inserted', 'meta.diff.header.to-file', 'punctuation.definition.inserted'],
      settings: { foreground: STRING },
    },
    {
      scope: ['markup.deleted', 'meta.diff.header.from-file', 'punctuation.definition.deleted'],
      settings: { foreground: DANGER },
    },
    {
      scope: ['markup.changed', 'meta.diff.range'],
      settings: { foreground: TYPE },
    },
    {
      scope: ['invalid', 'invalid.illegal'],
      settings: { foreground: DANGER, fontStyle: 'underline' },
    },
  ],
};
