import type { DynamicImportLanguageRegistration } from 'shiki/core';

/**
 * 预览代码块支持的语言。
 *
 * 每个语言都单独动态 import，Vite 会为它切出独立 chunk：只有文章里真的出现
 * 这门语言，浏览器才会下载对应语法。不要在模块顶层静态 import 语言包。
 */
interface CodeLanguageDefinition {
  readonly label: string;
  readonly load: DynamicImportLanguageRegistration;
}

export const CODE_LANGUAGES = {
  javascript: { label: 'JavaScript', load: () => import('shiki/langs/javascript.mjs') },
  typescript: { label: 'TypeScript', load: () => import('shiki/langs/typescript.mjs') },
  jsx: { label: 'JSX', load: () => import('shiki/langs/jsx.mjs') },
  tsx: { label: 'TSX', load: () => import('shiki/langs/tsx.mjs') },
  json: { label: 'JSON', load: () => import('shiki/langs/json.mjs') },
  html: { label: 'HTML', load: () => import('shiki/langs/html.mjs') },
  xml: { label: 'XML', load: () => import('shiki/langs/xml.mjs') },
  css: { label: 'CSS', load: () => import('shiki/langs/css.mjs') },
  scss: { label: 'SCSS', load: () => import('shiki/langs/scss.mjs') },
  vue: { label: 'Vue', load: () => import('shiki/langs/vue.mjs') },
  svelte: { label: 'Svelte', load: () => import('shiki/langs/svelte.mjs') },
  python: { label: 'Python', load: () => import('shiki/langs/python.mjs') },
  bash: { label: 'Bash', load: () => import('shiki/langs/bash.mjs') },
  powershell: { label: 'PowerShell', load: () => import('shiki/langs/powershell.mjs') },
  yaml: { label: 'YAML', load: () => import('shiki/langs/yaml.mjs') },
  toml: { label: 'TOML', load: () => import('shiki/langs/toml.mjs') },
  ini: { label: 'INI', load: () => import('shiki/langs/ini.mjs') },
  markdown: { label: 'Markdown', load: () => import('shiki/langs/markdown.mjs') },
  sql: { label: 'SQL', load: () => import('shiki/langs/sql.mjs') },
  go: { label: 'Go', load: () => import('shiki/langs/go.mjs') },
  rust: { label: 'Rust', load: () => import('shiki/langs/rust.mjs') },
  java: { label: 'Java', load: () => import('shiki/langs/java.mjs') },
  kotlin: { label: 'Kotlin', load: () => import('shiki/langs/kotlin.mjs') },
  csharp: { label: 'C#', load: () => import('shiki/langs/csharp.mjs') },
  c: { label: 'C', load: () => import('shiki/langs/c.mjs') },
  cpp: { label: 'C++', load: () => import('shiki/langs/cpp.mjs') },
  php: { label: 'PHP', load: () => import('shiki/langs/php.mjs') },
  ruby: { label: 'Ruby', load: () => import('shiki/langs/ruby.mjs') },
  lua: { label: 'Lua', load: () => import('shiki/langs/lua.mjs') },
  swift: { label: 'Swift', load: () => import('shiki/langs/swift.mjs') },
  dart: { label: 'Dart', load: () => import('shiki/langs/dart.mjs') },
  scala: { label: 'Scala', load: () => import('shiki/langs/scala.mjs') },
  perl: { label: 'Perl', load: () => import('shiki/langs/perl.mjs') },
  r: { label: 'R', load: () => import('shiki/langs/r.mjs') },
  diff: { label: 'Diff', load: () => import('shiki/langs/diff.mjs') },
  dockerfile: { label: 'Dockerfile', load: () => import('shiki/langs/docker.mjs') },
  makefile: { label: 'Makefile', load: () => import('shiki/langs/make.mjs') },
  nginx: { label: 'Nginx', load: () => import('shiki/langs/nginx.mjs') },
  http: { label: 'HTTP', load: () => import('shiki/langs/http.mjs') },
  graphql: { label: 'GraphQL', load: () => import('shiki/langs/graphql.mjs') },
} as const satisfies Record<string, CodeLanguageDefinition>;

export type CodeLanguageId = keyof typeof CODE_LANGUAGES;

/** 围栏里常见的别名 / 扩展名。键一律小写。 */
const LANGUAGE_ALIASES: Record<string, CodeLanguageId> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  htm: 'html',
  xhtml: 'html',
  svg: 'xml',
  sass: 'scss',
  py: 'python',
  python3: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  ps1: 'powershell',
  pwsh: 'powershell',
  yml: 'yaml',
  md: 'markdown',
  mdx: 'markdown',
  mysql: 'sql',
  pgsql: 'sql',
  postgres: 'sql',
  sqlite: 'sql',
  golang: 'go',
  rs: 'rust',
  kt: 'kotlin',
  kts: 'kotlin',
  cs: 'csharp',
  'c#': 'csharp',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  rb: 'ruby',
  pl: 'perl',
  patch: 'diff',
  docker: 'dockerfile',
  make: 'makefile',
  mk: 'makefile',
  gql: 'graphql',
  cfg: 'ini',
  properties: 'ini',
};

/**
 * 明确要求「不要高亮」的围栏标记。它们和未知语言一样保持纯文本，
 * 区别只是不会被自动识别覆盖。
 */
const PLAIN_LANGUAGE_TOKENS = new Set(['text', 'txt', 'plain', 'plaintext', 'none', 'output']);

export type CodeLanguageResolution =
  | { kind: 'none' }
  | { kind: 'plain' }
  | { kind: 'unsupported' }
  | { kind: 'language'; id: CodeLanguageId };

/** 围栏信息串 → 规范化的小写语言名（取第一个 token，兼容 `{.js}` 写法）。 */
export function normalizeLanguageToken(info: string | null | undefined): string | null {
  if (!info) return null;
  const first = info.trim().split(/[\s,]+/)[0];
  if (!first) return null;
  let token = first.toLowerCase();
  if (token.startsWith('language-')) token = token.slice('language-'.length);
  token = token.replace(/^\{\.?/, '').replace(/\}$/, '');
  return token || null;
}

/** 从 `<code class="language-ts">` 里取出语言名。 */
export function parseFenceLanguage(className: string | null | undefined): string | null {
  const match = /(?:^|\s)language-([^\s]+)/.exec(className ?? '');
  return match?.[1] ?? null;
}

export function resolveCodeLanguage(info: string | null | undefined): CodeLanguageResolution {
  const token = normalizeLanguageToken(info);
  if (!token) return { kind: 'none' };
  if (PLAIN_LANGUAGE_TOKENS.has(token)) return { kind: 'plain' };
  const id = Object.hasOwn(CODE_LANGUAGES, token) ? (token as CodeLanguageId) : LANGUAGE_ALIASES[token];
  return id ? { kind: 'language', id } : { kind: 'unsupported' };
}

export function codeLanguageLabel(id: CodeLanguageId): string {
  return CODE_LANGUAGES[id].label;
}

type Detector = (code: string, context: Sample) => number;

interface Sample {
  trimmed: string;
  lines: string[];
  filled: string[];
}

function sample(code: string): Sample {
  const lines = code.split('\n');
  return {
    trimmed: code.trim(),
    lines,
    filled: lines.filter((line) => line.trim().length > 0),
  };
}

function countMatches(lines: string[], pattern: RegExp): number {
  let count = 0;
  for (const line of lines) {
    if (pattern.test(line)) count += 1;
  }
  return count;
}

function isJson(code: string): number {
  const trimmed = code.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return 0;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === 'object' ? 0.99 : 0;
  } catch {
    return 0;
  }
}

function isHtml(_code: string, { trimmed }: Sample): number {
  if (/^<!doctype\s+html/i.test(trimmed)) return 0.99;
  const tags =
    trimmed.match(
      /<\/?(?:html|head|body|div|span|p|a|ul|ol|li|section|article|header|footer|main|nav|table|thead|tbody|tr|td|th|h[1-6]|img|br|hr|form|input|button|select|option|script|style|meta|link|label|figure|figcaption|pre|code)\b[^>]*>/gi,
    ) ?? [];
  if (tags.length < 2) return 0;
  // JSX/TSX 也长这样：有 import/return 时降权，让 tsx/jsx 检测器胜出。
  const hasScriptSyntax = /\b(?:import|export|const|let|function|return)\b/.test(trimmed);
  return hasScriptSyntax ? 0.6 : 0.9;
}

function isDiff(code: string, { lines }: Sample): number {
  const hasHeader = /^(?:diff --git|index [0-9a-f]{7,}|@@ -\d)/m.test(code);
  const plus = countMatches(lines, /^\+\+\+ /);
  const minus = countMatches(lines, /^--- /);
  if (hasHeader && (plus > 0 || minus > 0)) return 0.97;
  if (hasHeader) return 0.9;
  const hunks = countMatches(lines, /^@@ [^@]+ @@/);
  return hunks > 0 ? 0.85 : 0;
}

function isDockerfile(code: string, { filled }: Sample): number {
  if (!/^\s*FROM\s+\S+/im.test(code)) return 0;
  const instructions = countMatches(
    filled,
    /^(?:RUN|COPY|ADD|CMD|ENTRYPOINT|WORKDIR|ENV|ARG|EXPOSE|VOLUME|USER|LABEL|HEALTHCHECK|SHELL|ONBUILD)\b/i,
  );
  return instructions > 0 ? 0.96 : 0;
}

function isMakefile(_code: string, { lines }: Sample): number {
  if (!lines.some((line) => line.startsWith('\t'))) return 0;
  const targets = countMatches(lines, /^[A-Za-z0-9_./%$()-]+:\s*(?:[^=].*)?$/);
  return targets >= 1 ? 0.86 : 0;
}

function isNginx(code: string): number {
  if (!/^\s*(?:server|http|events|stream|location\s+\S+)\s*\{/m.test(code)) return 0;
  return /\b(?:proxy_pass|listen|server_name|root|location|upstream)\b/.test(code) ? 0.9 : 0;
}

function isHttp(_code: string, { trimmed }: Sample): number {
  return /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+\s+HTTP\/\d(?:\.\d)?$/m.test(trimmed) ? 0.97 : 0;
}

function isGraphql(code: string): number {
  return /^\s*(?:query|mutation|subscription|fragment|schema)\s+[\w({]/m.test(code) &&
    /\{[\s\S]*\}/.test(code)
    ? 0.92
    : 0;
}

function isSql(code: string): number {
  return /\b(?:SELECT\s+[\s\S]{0,120}?\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA)|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i.test(
    code,
  )
    ? 0.93
    : 0;
}

function isScss(code: string): number {
  if (/\$[\w-]+\s*:/.test(code)) return 0.9;
  if (/@(?:mixin|include|extend|use|forward|each|if)\b/.test(code)) return 0.9;
  return 0;
}

function isCss(code: string, { filled }: Sample): number {
  if (!/\{[\s\S]*\}/.test(code)) return 0;
  const properties = countMatches(filled, /^\s*[-a-z][\w-]*\s*:\s*[^;{}]+;?\s*$/i);
  const atRules = /@(?:media|keyframes|font-face|supports|import)\b/.test(code);
  if (properties >= 2) return 0.88;
  if (atRules && properties >= 1) return 0.85;
  return 0;
}

function isTypeScript(code: string): number {
  const typed =
    /:\s*(?:string|number|boolean|void|any|unknown|never|object|bigint|symbol|null|undefined|[A-Z]\w*(?:<[^>\n]+>)?)(?=\s*[,)=;{&|[\]]|\s*$)/m.test(
      code,
    );
  const genericCall = /\b[a-z]\w*<[A-Za-z]\w*(?:<[^>\n]+>)?>\s*\(/.test(code);
  const declaration = /^\s*(?:interface|type|enum|namespace)\s+\w+/m.test(code);
  const assertion = /\bas\s+(?:const|[A-Z]\w*)\b/.test(code) || /\bimplements\s+\w+/.test(code);
  if (!typed && !genericCall && !declaration && !assertion) return 0;
  // 纯类型声明也要有 JS 语境的兜底，避免把 YAML/散文里的冒号当类型。
  const scriptish = /\b(?:import|export|const|let|var|function|class|return|=>)\b/.test(code);
  return scriptish ? 0.92 : 0.7;
}

function isVue(code: string, { trimmed }: Sample): number {
  return /^<template[\s>]/.test(trimmed) && /<script[\s>]/.test(code) ? 0.96 : 0;
}

function isSvelte(code: string): number {
  return /<script[\s>]/.test(code) && /\{[#:@][\w\s]|\{@html\b|\{#if\b/.test(code) ? 0.94 : 0;
}

function isTsx(code: string): number {
  const jsxLike = /<\/?[A-Z][\w.]*\b/.test(code) || /<\/[a-z][\w-]*>/.test(code);
  if (!jsxLike) return 0;
  const ts = isTypeScript(code) > 0;
  const reactish = /\b(?:import|export|return|const|function|=>)\b/.test(code);
  if (reactish && ts) return 0.95;
  if (reactish) return 0.9;
  return 0;
}

function isJavascript(code: string): number {
  if (/^#!.*\bnode\b/m.test(code)) return 0.94;
  const signals = [
    /\b(?:const|let|var)\s+[\w{[]/,
    /\bfunction\b\s*\w*\s*\(/,
    /=>/,
    /\bconsole\.\w+\s*\(/,
    /\bdocument\.|\bwindow\./,
    /\brequire\s*\(\s*['"]/,
    /\bmodule\.exports\b/,
    /\b(?:import|export)\b[^\n]*\bfrom\b/,
    /\bclass\s+\w+\s*(?:extends\s+\w+\s*)?\{/,
  ];
  const hits = signals.reduce((sum, pattern) => sum + (pattern.test(code) ? 1 : 0), 0);
  return hits >= 2 ? 0.82 : hits === 1 ? 0.68 : 0;
}

function isPython(code: string): number {
  const blocks = countMatches(code.split('\n'), /^\s*(?:def|class)\s+\w+[^\n]*:\s*$/);
  const imports = countMatches(
    code.split('\n'),
    /^\s*(?:from\s+[\w.]+\s+import\s+[\w.*]+(?:\s+as\s+\w+)?|import\s+[\w.]+(?:\s+as\s+\w+)?)\s*$/,
  );
  const decorator = /^\s*@[\w.]+(?:\([^)]*\))?\s*$/m.test(code);
  const prints = /\bprint\s*\(/.test(code);
  if (blocks > 0) return 0.92;
  if (imports > 0 && (decorator || prints)) return 0.86;
  if (decorator && /\bself\b/.test(code)) return 0.82;
  if (prints && imports > 0) return 0.8;
  return 0;
}

function isRuby(code: string, { lines }: Sample): number {
  if (!/^\s*end\s*$/m.test(code)) return 0;
  const defs = countMatches(lines, /^\s*def\s+\w+[?!]?(?:\s*\([^)]*\))?\s*$/);
  if (defs === 0) return 0;
  const rubyish = /\bputs\b|\battr_\w+\b|\bdo\s*\|[^|]*\||^\s*(?:class|module)\s+\w+/m.test(code);
  return rubyish ? 0.88 : 0.78;
}

function isGo(code: string): number {
  if (/^\s*package\s+\w+\s*$/m.test(code) && /^\s*func\s+/m.test(code)) return 0.97;
  if (/\bpackage\s+\w+\b/.test(code) && /:=/.test(code)) return 0.8;
  return 0;
}

function isRust(code: string): number {
  const fn = /^\s*(?:pub\s+)?(?:async\s+)?fn\s+\w+/m.test(code);
  const idioms = /\blet\s+mut\b|\bimpl\b|\buse\s+[\w:]+;|\bprintln!|->\s*[\w<&]/.test(code);
  if (fn && idioms) return 0.94;
  if (/\b(?:struct|enum|trait)\s+\w+/.test(code) && /\bimpl\b/.test(code)) return 0.86;
  return 0;
}

function isJava(code: string): number {
  if (/public\s+static\s+void\s+main\s*\(/.test(code)) return 0.95;
  if (/^\s*(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:class|interface|enum)\s+\w+/m.test(code)) return 0.9;
  if (/\bSystem\.out\.println\s*\(/.test(code)) return 0.88;
  return 0;
}

function isKotlin(code: string): number {
  if (!/^\s*(?:private\s+|internal\s+|public\s+)?fun\s+\w+\s*\(/m.test(code)) return 0;
  const vals = countMatches(code.split('\n'), /^\s*(?:val|var)\s+\w+/);
  return vals > 0 ? 0.88 : 0;
}

function isCsharp(code: string): number {
  if (/^\s*using\s+System(?:\.\w+)*\s*;/m.test(code)) return 0.97;
  if (/^\s*namespace\s+[\w.]+/m.test(code) && /\bclass\s+\w+/.test(code)) return 0.9;
  if (/\bConsole\.WriteLine\s*\(/.test(code)) return 0.88;
  return 0;
}

function isCpp(code: string): number {
  if (/^\s*#include\s*<(?:iostream|vector|string|map|memory|algorithm|array|utility|bits\/stdc\+\+\.h)>/m.test(code)) {
    return 0.96;
  }
  if (/\bstd::|\bcout\s*<<|\bcin\s*>>|\btemplate\s*</.test(code)) return 0.9;
  return 0;
}

function isC(code: string): number {
  if (!/^\s*#include\s*<[\w./]+\.h>/m.test(code)) return 0;
  if (/\bstd::|\bcout\b|\bclass\s+\w+/.test(code)) return 0;
  return /\b(?:int|char|void|float|double)\s+main\s*\(/.test(code) ? 0.9 : 0.82;
}

function isSwift(code: string): number {
  if (/^\s*import\s+(?:Foundation|UIKit|SwiftUI|Combine)\s*$/m.test(code)) return 0.94;
  if (/^\s*func\s+\w+\s*\([^)]*\)\s*(?:->\s*\w+)?\s*\{/m.test(code)) return 0.86;
  if (/^\s*(?:let|var)\s+\w+\s*:\s*[A-Z]\w*/.test(code) && /\bguard\b|\bif\s+let\b/.test(code)) return 0.84;
  return 0;
}

function isDart(code: string): number {
  if (/\bimport\s+['"]package:flutter\//.test(code)) return 0.96;
  if (/\bvoid\s+main\s*\(\s*\)\s*\{/.test(code) && /\bWidget\b|\brunApp\s*\(/.test(code)) return 0.9;
  return 0;
}

function isScala(code: string): number {
  if (!/^\s*(?:object|trait|case\s+class)\s+\w+/m.test(code)) return 0;
  return /\bval\s+\w+|\bdef\s+\w+/.test(code) ? 0.86 : 0;
}

function isLua(code: string): number {
  if (/^\s*local\s+[\w.]+\s*=/m.test(code) && /\bend\b/.test(code)) return 0.9;
  if (/^\s*function\s+[\w.:]+\s*\(/m.test(code) && /\bend\b/.test(code)) return 0.84;
  return 0;
}

function isPerl(code: string): number {
  if (/^\s*use\s+(?:strict|warnings)\s*;/m.test(code)) return 0.96;
  if (/^\s*my\s+[$@%]\w+/m.test(code) && /[=~]\s*~?\s*(?:m|s|tr|qw)\W/.test(code)) return 0.88;
  return 0;
}

function isR(code: string): number {
  if (/^\s*[\w.]+\s*<-\s*/m.test(code) && /\b(?:function|c|mean|sum|library)\s*\(/.test(code)) return 0.88;
  if (/^\s*library\s*\(\s*\w+\s*\)/m.test(code)) return 0.85;
  return 0;
}

function isPowershell(code: string, { filled }: Sample): number {
  if (/\$env:[\w]+/.test(code)) return 0.9;
  const cmdlets = countMatches(
    filled,
    /^\s*(?:Get|Set|New|Remove|Start|Stop|Invoke|Write|Read|Test|Select|Where|ForEach)-[A-Z]\w+/,
  );
  if (cmdlets >= 1) return 0.88;
  return /^\s*param\s*\(/m.test(code) && /\$\w+/.test(code) ? 0.8 : 0;
}

function isBash(code: string, { filled }: Sample): number {
  if (/^#!.*\b(?:bash|zsh|ksh|sh)\b/m.test(code)) return 0.97;
  const promptLines = countMatches(filled, /^\s*(?:\$|>)\s+\S+/);
  const commands = countMatches(
    filled,
    /^\s*(?:sudo|cd|ls|cat|echo|printf|curl|wget|git|npm|pnpm|yarn|docker|kubectl|helm|brew|apt|apt-get|chmod|chown|mkdir|rm|cp|mv|export|source|tar|ssh|make)\b/,
  );
  if (promptLines >= 1) return 0.86;
  if (commands >= 2) return 0.8;
  return 0;
}

function isYaml(code: string, { lines, filled }: Sample): number {
  if (filled.length < 2) return 0;
  // 花括号属于代码结构（CSS/JSON/JS），YAML 的 flow 写法交给 JSON 检测器；
  // 行尾分号同样说明这是别的语言。
  if (/[{}]/.test(code)) return 0;
  if (countMatches(lines, /;\s*$/) > 0) return 0;
  const pairs = countMatches(
    lines,
    /^(?:\s*)(?:-\s+)?[A-Za-z_$"'][\w$.-]*(?:\s*\[[^\]]*\])?\s*:(?:\s+(?!\/\/).*)?$/,
  );
  const items = countMatches(lines, /^\s*-\s+\S+/);
  if (pairs >= 2) return 0.84;
  if (pairs >= 1 && items >= 1) return 0.8;
  return 0;
}

function isToml(code: string): number {
  if (/^\s*;/m.test(code)) return 0;
  if (!/^\s*\[[\w.-]+\]\s*$/m.test(code)) return 0;
  return /^\s*[\w"'-]+\s*=\s*.+$/m.test(code) ? 0.9 : 0;
}

function isIni(code: string): number {
  if (!/^\s*\[[\w .-]+\]\s*$/m.test(code)) return 0;
  if (!/^\s*[\w.-]+\s*=\s*.+$/m.test(code)) return 0;
  return /^\s*[;#]\s*/m.test(code) ? 0.82 : 0.72;
}

function isMarkdown(code: string, { lines }: Sample): number {
  if (!/^#{1,6}\s+\S/m.test(code)) return 0;
  const lists = countMatches(lines, /^\s*(?:[-*+]|\d+\.)\s+\S+/);
  const links = /\[[^\]]+\]\((?:[^)]+)\)/.test(code);
  if (lists >= 2 || links) return 0.84;
  return 0;
}

const DETECTORS: Array<{ id: CodeLanguageId; detect: Detector }> = [
  { id: 'json', detect: isJson },
  { id: 'diff', detect: isDiff },
  { id: 'dockerfile', detect: isDockerfile },
  { id: 'php', detect: (code) => (/^<\?php/.test(code.trim()) ? 0.98 : 0) },
  { id: 'html', detect: isHtml },
  { id: 'xml', detect: (code) => (/^(?:<\?xml\b|\s*<[\w:-]+\s+xmlns=)/.test(code.trim()) ? 0.96 : 0) },
  { id: 'graphql', detect: isGraphql },
  { id: 'sql', detect: isSql },
  { id: 'scss', detect: isScss },
  { id: 'css', detect: isCss },
  { id: 'vue', detect: isVue },
  { id: 'svelte', detect: isSvelte },
  { id: 'tsx', detect: isTsx },
  { id: 'jsx', detect: (code) => (isTsx(code) > 0 && isTypeScript(code) === 0 ? 0.92 : 0) },
  { id: 'typescript', detect: isTypeScript },
  { id: 'javascript', detect: isJavascript },
  { id: 'python', detect: isPython },
  { id: 'ruby', detect: isRuby },
  { id: 'go', detect: isGo },
  { id: 'rust', detect: isRust },
  { id: 'java', detect: isJava },
  { id: 'kotlin', detect: isKotlin },
  { id: 'csharp', detect: isCsharp },
  { id: 'cpp', detect: isCpp },
  { id: 'c', detect: isC },
  { id: 'swift', detect: isSwift },
  { id: 'dart', detect: isDart },
  { id: 'scala', detect: isScala },
  { id: 'lua', detect: isLua },
  { id: 'perl', detect: isPerl },
  { id: 'r', detect: isR },
  { id: 'powershell', detect: isPowershell },
  { id: 'bash', detect: isBash },
  { id: 'toml', detect: isToml },
  { id: 'ini', detect: isIni },
  { id: 'yaml', detect: isYaml },
  { id: 'markdown', detect: isMarkdown },
  { id: 'makefile', detect: isMakefile },
  { id: 'nginx', detect: isNginx },
  { id: 'http', detect: isHttp },
];

const DETECTION_THRESHOLD = 0.6;

/**
 * 没有写语言的围栏块 → 猜测语言。
 *
 * 只用可解释的启发式（看结构而不是词频），拿不到足够证据就返回 null，
 * 让代码保持纯文本——猜错比不猜更打扰阅读。
 */
export function detectCodeLanguage(code: string): CodeLanguageId | null {
  if (!code.trim()) return null;
  const context = sample(code);
  let best: { id: CodeLanguageId; score: number } | null = null;
  for (const detector of DETECTORS) {
    const score = detector.detect(code, context);
    if (score < DETECTION_THRESHOLD) continue;
    if (!best || score > best.score) best = { id: detector.id, score };
  }
  return best?.id ?? null;
}
