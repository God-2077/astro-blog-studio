import { isMarkdownDocument } from './paths';

/** 新稿只把这几种后缀当 Markdown；是否进入索引仍由当前仓库的 content.extensions 决定。 */
const POST_EXTENSION_RE = /\.(?:md|mdx)$/i;
const SEPARATOR_RE = /[/\\]/;
const ILLEGAL_RE = /[<>:"|?*]/g;
const RESERVED_BASE_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

/** 文件名不合法时的原因码；文案由组件映射，模块本身不做 i18n。 */
export type FilenameIssue =
  | { code: 'empty' }
  | { code: 'pathSeparator' }
  | { code: 'control' }
  | { code: 'illegalChars'; chars: string }
  | { code: 'reserved'; name: string }
  | { code: 'trailingDot' };

export interface FilenameResolution {
  /** 最终写入 usePendingPost.path 的文件名；非法时为空串。 */
  filename: string;
  /** 非空表示不能创建。 */
  issue: FilenameIssue | null;
  /** 输入里显式写出的、不受支持的扩展名，仅用于非阻断提示。 */
  unsupportedSuffix: string | null;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code < 0x20 || code === 0x7f)) return true;
  }
  return false;
}

/** 返回用户写法的保留名（保留大小写），便于提示；不是保留名时返回 null。 */
function reservedBaseName(filename: string): string | null {
  const dot = filename.indexOf('.');
  const base = (dot === -1 ? filename : filename.slice(0, dot)).trimEnd();
  if (!base) return null;
  return RESERVED_BASE_NAMES.has(base.toUpperCase()) ? base : null;
}

function inspectFilename(filename: string): FilenameIssue | null {
  if (SEPARATOR_RE.test(filename)) return { code: 'pathSeparator' };
  if (hasControlCharacter(filename)) return { code: 'control' };
  const illegal = [...new Set(filename.match(ILLEGAL_RE) ?? [])].join(' ');
  if (illegal) return { code: 'illegalChars', chars: illegal };
  if (filename.endsWith('.')) return { code: 'trailingDot' };
  const reserved = reservedBaseName(filename);
  if (reserved) return { code: 'reserved', name: reserved };
  if (!filename.replace(POST_EXTENSION_RE, '')) return { code: 'empty' };
  return null;
}

function finalize(filename: string, unsupportedSuffix: string | null): FilenameResolution {
  const issue = inspectFilename(filename);
  if (issue) return { filename: '', issue, unsupportedSuffix: null };
  return { filename, issue: null, unsupportedSuffix };
}

/** 手填文件名：trim 后尽量原样保留，只在平台不允许时返回 issue。 */
export function resolveManualFilename(input: string): FilenameResolution {
  const name = input.trim();
  if (!name) return { filename: '', issue: { code: 'empty' }, unsupportedSuffix: null };
  // 先拒绝结尾点，避免补 .md 后变成 note..md。
  if (name.endsWith('.')) return { filename: '', issue: { code: 'trailingDot' }, unsupportedSuffix: null };

  if (isMarkdownDocument(name)) return finalize(name, null);

  const dot = name.lastIndexOf('.');
  // 没有后缀（或以点开头的隐藏名）仍补 .md；显式写了别的后缀则保留原名，仅做提示。
  if (dot <= 0) return finalize(`${name}.md`, null);
  return finalize(name, name.slice(dot));
}

/** 标题回退文件名：沿用既有的 slug 规则，并识别 .md / .mdx 后缀。 */
export function resolveTitleFilename(title: string): FilenameResolution {
  const trimmed = title.trim();
  const match = /^(.*?)(\.(?:md|mdx))$/i.exec(trimmed);
  const base = match?.[1] ?? trimmed;
  const extension = match?.[2] ?? '.md';
  const cleaned = base
    .replace(/[\p{P}\p{S}\s]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleaned) return { filename: '', issue: { code: 'empty' }, unsupportedSuffix: null };
  return finalize(cleaned + extension, null);
}
