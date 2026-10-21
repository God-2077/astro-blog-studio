import { escapeHtml } from './escape';

/**
 * Tiny fenced-code highlighter for the preview pane.
 *
 * The preview re-renders on every keystroke, so this stays dependency-free and
 * synchronous. It only does a shallow pass: comments/strings first, then a few
 * keyword/number roles. Unknown languages fall back to plain escaped text.
 */

const MAX_HIGHLIGHT_CHARS = 20_000;

type Token = 'attr' | 'builtin' | 'comment' | 'keyword' | 'literal' | 'number' | 'string' | 'tag';
type Family = 'css' | 'js' | 'markup' | 'plain' | 'python' | 'shell';

interface Rule {
  token: Token;
  pattern: string;
}

interface Compiled {
  regex: RegExp;
  tokens: Token[];
}

interface FamilySpec {
  primary: Compiled;
  secondary?: Compiled;
}

function compile(rules: Rule[]): Compiled {
  return {
    regex: new RegExp(rules.map((rule, index) => `(?<t${index}>${rule.pattern})`).join('|'), 'g'),
    tokens: rules.map((rule) => rule.token),
  };
}

const NUMBER = /\b(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/;

const JS_KEYWORDS =
  /\b(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|infer|instanceof|interface|keyof|let|namespace|new|of|private|protected|public|readonly|return|satisfies|set|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield)\b/;
const JS_LITERALS = /\b(?:Infinity|NaN|false|null|true|undefined)\b/;
const JS_BUILTINS =
  /\b(?:Array|Boolean|Date|Error|JSON|Map|Math|Number|Object|Promise|RegExp|Set|String|WeakMap|console|document|globalThis|window)\b/;

const SHELL_KEYWORDS = /\b(?:case|do|done|elif|else|esac|fi|for|function|if|in|select|then|time|until|while)\b/;
const SHELL_BUILTINS =
  /\b(?:alias|awk|cat|cd|chmod|chown|cp|curl|echo|exit|export|git|grep|ls|mkdir|mv|node|npm|pnpm|printf|pwd|read|return|rm|sed|set|source|sudo|test|unset)\b/;

const PY_KEYWORDS =
  /\b(?:and|as|assert|async|await|break|case|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|match|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/;
const PY_LITERALS = /\b(?:False|None|True)\b/;
const PY_BUILTINS =
  /\b(?:bool|dict|enumerate|float|input|int|isinstance|len|list|map|max|min|open|print|range|set|sorted|str|sum|super|tuple|type|zip)\b/;

const LANG_FAMILY: Record<string, Family> = {
  js: 'js',
  javascript: 'js',
  jsx: 'js',
  ts: 'js',
  tsx: 'js',
  typescript: 'js',
  json: 'js',
  jsonc: 'js',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  shell: 'shell',
  console: 'shell',
  py: 'python',
  python: 'python',
  astro: 'markup',
  htm: 'markup',
  html: 'markup',
  svg: 'markup',
  vue: 'markup',
  xml: 'markup',
  css: 'css',
  less: 'css',
  scss: 'css',
};

const FAMILIES: Record<Exclude<Family, 'plain'>, FamilySpec> = {
  js: {
    primary: compile([
      { token: 'comment', pattern: /\/\*[\s\S]*?\*\/|\/\/[^\n]*/.source },
      { token: 'string', pattern: /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/.source },
    ]),
    secondary: compile([
      { token: 'keyword', pattern: JS_KEYWORDS.source },
      { token: 'literal', pattern: JS_LITERALS.source },
      { token: 'builtin', pattern: JS_BUILTINS.source },
      { token: 'number', pattern: NUMBER.source },
    ]),
  },
  shell: {
    primary: compile([
      { token: 'comment', pattern: /#[^\n]*/.source },
      { token: 'string', pattern: /'[^']*'|"(?:[^"\\]|\\.)*"/.source },
      { token: 'attr', pattern: /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*/.source },
    ]),
    secondary: compile([
      { token: 'keyword', pattern: SHELL_KEYWORDS.source },
      { token: 'builtin', pattern: SHELL_BUILTINS.source },
      { token: 'number', pattern: NUMBER.source },
    ]),
  },
  python: {
    primary: compile([
      { token: 'string', pattern: /'''[\s\S]*?'''|"""[\s\S]*?"""/.source },
      { token: 'comment', pattern: /#[^\n]*/.source },
      { token: 'string', pattern: /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/.source },
    ]),
    secondary: compile([
      { token: 'keyword', pattern: PY_KEYWORDS.source },
      { token: 'literal', pattern: PY_LITERALS.source },
      { token: 'builtin', pattern: PY_BUILTINS.source },
      { token: 'number', pattern: NUMBER.source },
    ]),
  },
  markup: {
    primary: compile([
      { token: 'comment', pattern: /<!--[\s\S]*?-->/.source },
      { token: 'tag', pattern: /<!DOCTYPE[^>]*>|<\/?[A-Za-z][\w:.-]*/.source },
      { token: 'attr', pattern: /[A-Za-z_:][\w:.-]*(?=\s*=)/.source },
      { token: 'string', pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/.source },
    ]),
    secondary: compile([{ token: 'literal', pattern: /&(?:#\d+|#x[\da-fA-F]+|[A-Za-z][\w]*);/.source }]),
  },
  css: {
    primary: compile([
      { token: 'comment', pattern: /\/\*[\s\S]*?\*\//.source },
      { token: 'string', pattern: /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/.source },
      { token: 'keyword', pattern: /@[\w-]+/.source },
      { token: 'attr', pattern: /[-\w]+(?=\s*:)/.source },
    ]),
    secondary: compile([{ token: 'number', pattern: NUMBER.source }]),
  },
};

function wrap(token: Token, value: string): string {
  return `<span class="tok-${token}">${escapeHtml(value)}</span>`;
}

function findToken(match: RegExpExecArray, tokens: Token[]): Token | null {
  if (!match.groups) return null;
  for (let index = 0; index < tokens.length; index += 1) {
    if (match.groups[`t${index}`] !== undefined) return tokens[index] ?? null;
  }
  return null;
}

function highlightGaps(text: string, secondary: Compiled | undefined): string {
  if (!text) return '';
  if (!secondary) return escapeHtml(text);

  let output = '';
  let cursor = 0;
  for (const match of text.matchAll(secondary.regex)) {
    const start = match.index ?? 0;
    if (start > cursor) output += escapeHtml(text.slice(cursor, start));
    const token = findToken(match, secondary.tokens);
    output += token ? wrap(token, match[0]) : escapeHtml(match[0]);
    cursor = start + match[0].length;
  }
  if (cursor < text.length) output += escapeHtml(text.slice(cursor));
  return output;
}

function highlight(text: string, spec: FamilySpec): string {
  let output = '';
  let cursor = 0;
  for (const match of text.matchAll(spec.primary.regex)) {
    const start = match.index ?? 0;
    output += highlightGaps(text.slice(cursor, start), spec.secondary);
    const token = findToken(match, spec.primary.tokens);
    output += token ? wrap(token, match[0]) : escapeHtml(match[0]);
    cursor = start + match[0].length;
  }
  output += highlightGaps(text.slice(cursor), spec.secondary);
  return output;
}

function readLang(lang: string | undefined): { family: Family; label: string } {
  const label = (lang ?? '').trim().toLowerCase().split(/\s+/)[0] ?? '';
  return { family: LANG_FAMILY[label] ?? 'plain', label };
}

/** Render a fenced block to `<pre><code>` with token spans, escaping all code text. */
export function renderFencedCode(text: string, lang: string | undefined, escaped = false): string {
  const { family, label } = readLang(lang);
  const safeLabel = label.replace(/[^\w#+.-]/g, '');
  const classAttr = safeLabel ? ` class="language-${safeLabel}"` : '';
  if (escaped) return `<pre><code${classAttr}>${text}</code></pre>`;
  if (family === 'plain' || text.length > MAX_HIGHLIGHT_CHARS) {
    return `<pre><code${classAttr}>${escapeHtml(text)}</code></pre>`;
  }
  return `<pre><code${classAttr}>${highlight(text, FAMILIES[family])}</code></pre>`;
}
