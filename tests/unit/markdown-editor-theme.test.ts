import { readFileSync } from 'node:fs';
import { markdown } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, highlightingFor, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import { describe, expect, it } from 'vitest';
import { markdownHighlightStyle } from '@/lib/markdown/editor-theme';

const SAMPLE = [
  '## heading',
  '',
  '> quote',
  '',
  '---',
  '',
  '- [x] task',
  '',
  '**strong** *emphasis* ~~deleted~~',
  '',
  '`code`',
  '',
  '[link](https://example.com "title")',
  '',
  '<!-- comment -->',
  '',
  '| a | b |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '\\* escaped',
].join('\n');

const state = EditorState.create({
  doc: SAMPLE,
  extensions: [
    markdown(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    syntaxHighlighting(markdownHighlightStyle),
  ],
});

const highlightedTags = {
  heading: tags.heading,
  quote: tags.quote,
  emphasis: tags.emphasis,
  strong: tags.strong,
  strikethrough: tags.strikethrough,
  link: tags.link,
  linkTitle: tags.string,
  entity: tags.character,
  escape: tags.escape,
  taskMarker: tags.atom,
  url: tags.url,
  label: tags.labelName,
  monospace: tags.monospace,
  comment: tags.comment,
  rule: tags.contentSeparator,
  mark: tags.processingInstruction,
  invalid: tags.invalid,
} as const;

describe('markdownHighlightStyle', () => {
  it.each(Object.entries(highlightedTags))('styles the %s tag', (_name, tag) => {
    expect(highlightingFor(state, [tag])).toBeTruthy();
  });

  it('replaces the light-only default fallback instead of stacking on it', () => {
    // The default style colors keywords, but Markdown has no keyword; a non-null
    // result here would mean CodeMirror's light fallback is still active.
    expect(highlightingFor(state, [tags.keyword])).toBeNull();
  });
});

const CSS = readFileSync(new URL('../../src/styles/app.css', import.meta.url), 'utf8');

function block(selector: string): string {
  const start = CSS.indexOf(selector);
  if (start < 0) throw new Error(`missing CSS block: ${selector}`);
  const open = CSS.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < CSS.length; index += 1) {
    if (CSS[index] === '{') depth += 1;
    if (CSS[index] === '}') {
      depth -= 1;
      if (depth === 0) return CSS.slice(open + 1, index);
    }
  }
  throw new Error(`unclosed CSS block: ${selector}`);
}

function declarations(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of text.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name && value) result.set(`--${name}`, value.trim());
  }
  return result;
}

function themeValues(night: boolean): Map<string, string> {
  const values = declarations(block(':root {'));
  if (night) {
    for (const [name, value] of declarations(block(':root[data-theme="night"] {'))) values.set(name, value);
  }
  return values;
}

function resolve(values: Map<string, string>, token: string): string {
  const raw = values.get(token);
  if (!raw) throw new Error(`missing token: ${token}`);
  const alias = /^var\((--[\w-]+)\)$/.exec(raw);
  return alias?.[1] ? resolve(values, alias[1]) : raw;
}

type Rgba = readonly [number, number, number, number];

function parseColor(value: string): Rgba {
  const text = value.trim();
  if (text.startsWith('#')) {
    const hex = text.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((part) => part + part)
            .join('')
        : hex;
    if (full.length !== 6) throw new Error(`unsupported color: ${value}`);
    return [
      Number.parseInt(full.slice(0, 2), 16) / 255,
      Number.parseInt(full.slice(2, 4), 16) / 255,
      Number.parseInt(full.slice(4, 6), 16) / 255,
      1,
    ];
  }
  const match = /^rgba?\(([^)]+)\)$/.exec(text);
  const body = match?.[1];
  if (!body) throw new Error(`unsupported color: ${value}`);
  const parts = body.split(',').map((part) => Number.parseFloat(part));
  const [red = 0, green = 0, blue = 0, alpha = 1] = parts;
  return [red / 255, green / 255, blue / 255, alpha];
}

function composite(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top[3];
  return [
    top[0] * alpha + bottom[0] * (1 - alpha),
    top[1] * alpha + bottom[1] * (1 - alpha),
    top[2] * alpha + bottom[2] * (1 - alpha),
    1,
  ];
}

function luminance(color: Rgba): number {
  const [red = 0, green = 0, blue = 0] = color;
  const channel = (value: number): number => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(first: Rgba, second: Rgba): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const roleTokens = [
  ['heading', '--abs-md-heading'],
  ['link', '--abs-md-link'],
  ['code', '--abs-md-code'],
  ['string', '--abs-md-string'],
  ['muted', '--abs-md-muted'],
  ['rule', '--abs-md-rule'],
  ['invalid', '--abs-danger'],
] as const;

describe.each([
  ['day', false],
  ['night', true],
] as const)('%s Markdown syntax colors', (_theme, night) => {
  const values = themeValues(night);
  const paper = parseColor(resolve(values, '--abs-paper'));
  const activeLine = composite(parseColor(resolve(values, '--abs-active-line')), paper);
  const selection = composite(parseColor(resolve(values, '--abs-selection')), paper);
  const backgrounds = [
    ['paper', paper],
    ['active line', activeLine],
    ['selection', selection],
  ] as const;

  it.each(roleTokens)('%s stays above 4.5:1', (_role, token) => {
    const color = parseColor(resolve(values, token));
    for (const [background, value] of backgrounds) {
      expect(contrast(color, value), `${token} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
