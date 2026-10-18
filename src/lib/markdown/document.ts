import yaml from 'js-yaml';

export type Eol = '\n' | '\r\n';

export interface DocumentMeta {
  eol: Eol;
  mixed: boolean;
  bom: boolean;
  trailingNewline: boolean;
}

export interface ParsedDocument {
  meta: DocumentMeta;
  hasFrontmatter: boolean;
  frontmatterRaw: string;
  data: Record<string, unknown>;
  body: string;
  frontmatterError?: string;
}

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function countEols(text: string): { crlf: number; lf: number } {
  let crlf = 0;
  let lf = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '\n') continue;
    if (index > 0 && text[index - 1] === '\r') crlf += 1;
    else lf += 1;
  }
  return { crlf, lf };
}

export function detectMeta(text: string): DocumentMeta {
  const bom = text.startsWith('\uFEFF');
  const withoutBom = bom ? text.slice(1) : text;
  const { crlf, lf } = countEols(withoutBom);
  return {
    eol: crlf > lf ? '\r\n' : '\n',
    mixed: crlf > 0 && lf > 0,
    bom,
    trailingNewline: /\r?\n$/.test(withoutBom),
  };
}

function parseFrontmatter(raw: string): { data: Record<string, unknown>; error?: string } {
  try {
    const loaded = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
    if (loaded === null || loaded === undefined) return { data: {} };
    if (typeof loaded !== 'object' || Array.isArray(loaded)) {
      return { data: {}, error: 'frontmatter 不是一个对象' };
    }
    return { data: loaded as Record<string, unknown> };
  } catch (error) {
    return { data: {}, error: error instanceof Error ? error.message : String(error) };
  }
}

export function parseDocument(input: string): ParsedDocument {
  const bom = input.startsWith('\uFEFF');
  const text = bom ? input.slice(1) : input;
  const meta = detectMeta(input);
  const match = FRONTMATTER_RE.exec(text);

  if (!match) {
    return {
      meta,
      hasFrontmatter: false,
      frontmatterRaw: '',
      data: {},
      body: text,
    };
  }

  const raw = match[1] ?? '';
  const parsed = parseFrontmatter(raw);
  return {
    meta,
    hasFrontmatter: true,
    frontmatterRaw: raw,
    data: parsed.data,
    body: text.slice(match[0].length),
    frontmatterError: parsed.error,
  };
}

export interface ComposeInput {
  meta: DocumentMeta;
  frontmatterRaw: string;
  body: string;
  includeFrontmatter: boolean;
}

export function composeDocument({ meta, frontmatterRaw, body, includeFrontmatter }: ComposeInput): string {
  const { eol } = meta;
  const bodyLf = body.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  const bom = meta.bom ? '\uFEFF' : '';
  const trailing = meta.trailingNewline || bodyLf ? eol : '';

  if (!includeFrontmatter) return `${bom}${bodyLf.replace(/\n/g, eol)}${trailing}`;

  const inner = frontmatterRaw.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
  const innerEol = inner ? inner.replace(/\n/g, eol) : '';
  const front = innerEol ? `---${eol}${innerEol}${eol}---` : `---${eol}---`;
  const bodyEol = bodyLf ? eol + bodyLf.replace(/\n/g, eol) : '';
  return `${bom}${front}${bodyEol}${trailing}`;
}

const TOP_LEVEL_KEY = /^([A-Za-z0-9_$-]+)[ \t]*:/;

export function isQuotableString(value: string): boolean {
  if (value === '') return true;
  if (/^\s|\s$/.test(value)) return true;
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(value)) return true;
  if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(value)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true;
  if (/[:#\-?[\]{},&*!|>'"%@`]/.test(value)) return true;
  return false;
}

export function quoteYaml(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function serializeScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = String(value);
  return isQuotableString(text) ? quoteYaml(text) : text;
}

function serializeFlow(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serializeFlow).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{ ${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${serializeScalar(key)}: ${serializeFlow(item)}`)
      .join(', ')} }`;
  }
  return serializeScalar(value);
}

export function serializeFieldLines(key: string, value: unknown): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${key}: []`];
    return [`${key}:`, ...value.map((item) => `- ${serializeFlow(item)}`)];
  }
  if (value && typeof value === 'object') {
    return [`${key}:`, `  ${serializeFlow(value)}`];
  }
  return [`${key}: ${serializeScalar(value)}`];
}

function collectKeyRanges(lines: string[]): Array<{ key: string; start: number; end: number }> {
  const starts: Array<{ key: string; start: number }> = [];
  lines.forEach((line, index) => {
    const match = TOP_LEVEL_KEY.exec(line);
    if (match?.[1]) starts.push({ key: match[1], start: index });
  });
  return starts.map((item, index) => ({
    ...item,
    end: starts[index + 1]?.start ?? lines.length,
  }));
}

/** Replace only the given top-level keys; every other line stays byte-identical. */
export function updateFrontmatterRaw(raw: string, patch: Record<string, unknown>): string {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .replace(/^\n+|\n+$/g, '')
    .split('\n');
  if (lines.length === 1 && lines[0] === '') lines.length = 0;

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const ranges = collectKeyRanges(lines);
    const existing = ranges.find((range) => range.key === key);
    if (value === null) {
      if (existing) lines.splice(existing.start, existing.end - existing.start);
      continue;
    }
    const replacement = serializeFieldLines(key, value);
    if (existing) {
      const block = lines.slice(existing.start, existing.end);
      const continuation = block.slice(1);
      const blockIsMultiline = continuation.some((line) => /^\s+\S/.test(line) || /^-\s/.test(line));
      if (replacement.length === 1 && !blockIsMultiline) {
        // Scalar in a scalar slot: replace only the value line, keep following comments/blank lines.
        lines.splice(existing.start, 1, replacement[0] as string);
      } else {
        lines.splice(existing.start, existing.end - existing.start, ...replacement);
      }
    } else {
      lines.push(...replacement);
    }
  }

  const next = lines.join('\n').replace(/\n+$/g, '');
  try {
    yaml.load(next, { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    throw new Error(`frontmatter 序列化失败：${error instanceof Error ? error.message : String(error)}`);
  }
  return next;
}

export function frontmatterDateValue(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}
