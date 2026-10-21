import type { HighlighterCore } from 'shiki/core';
import {
  CODE_LANGUAGES,
  type CodeLanguageId,
  type CodeLanguageResolution,
  detectCodeLanguage,
  resolveCodeLanguage,
} from './code-language';
import { ABS_CODE_THEME, ABS_CODE_THEME_NAME } from './highlight-theme';

export type HighlightSource = 'fence' | 'detected';

export interface HighlightResult {
  /** 高亮后的 HTML（只有 span），可直接写进 `<code>`；null 表示保持纯文本。 */
  html: string | null;
  language: CodeLanguageId | null;
  source: HighlightSource | null;
}

/** 超长代码块不高亮：tokenize 会阻塞输入，阅读收益也有限。 */
const MAX_CODE_LENGTH = 40_000;
const MAX_CODE_LINES = 2_000;
const CACHE_LIMIT = 200;

const cache = new Map<string, HighlightResult>();
const inFlight = new Map<string, Promise<HighlightResult>>();
const loadingLanguages = new Map<CodeLanguageId, Promise<void>>();
/** 加载失败的语言集合：shiki 的错误通常是永久性的（语法正则不兼容、chunk 404 等），
 *  重试不会变好；这里只缓存进程内失败，页面刷新后用户会得到重新尝试的机会。 */
const failedLanguages = new Set<CodeLanguageId>();

let highlighterPromise: Promise<HighlighterCore | null> | null = null;

/**
 * shiki 只在预览里真的出现代码块时才下载（`shiki/core` + JS 正则引擎），
 * 文章没有代码块时不增加首屏体积。加载失败就整场保持纯文本，不再重试。
 */
async function getHighlighter(): Promise<HighlighterCore | null> {
  highlighterPromise ??= (async () => {
    try {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
      ]);
      return await createHighlighterCore({
        themes: [ABS_CODE_THEME],
        langs: [],
        // JS 引擎不需要 oniguruma wasm；个别语言的正则不支持时跳过而不是抛错。
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      });
    } catch {
      return null;
    }
  })();
  return highlighterPromise;
}

async function ensureLanguage(highlighter: HighlighterCore, id: CodeLanguageId): Promise<void> {
  if (highlighter.getLoadedLanguages().includes(id)) return;
  // 之前加载失败过：不再重试，直接抛给 run() 的 try-catch 降级为纯文本
  if (failedLanguages.has(id)) throw new Error(`Language ${id} previously failed to load`);
  const pending = loadingLanguages.get(id);
  if (pending) return pending;
  const task = highlighter.loadLanguage(CODE_LANGUAGES[id].load).catch((error: unknown) => {
    loadingLanguages.delete(id);
    failedLanguages.add(id);
    throw error;
  });
  loadingLanguages.set(id, task);
  return task;
}

function remember(key: string, result: HighlightResult): HighlightResult {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, result);
  return result;
}

function plainResult(language: CodeLanguageId | null, source: HighlightSource | null): HighlightResult {
  return { html: null, language, source };
}

async function run(
  key: string,
  code: string,
  resolution: CodeLanguageResolution,
): Promise<HighlightResult> {
  let language: CodeLanguageId | null = resolution.kind === 'language' ? resolution.id : null;
  let source: HighlightSource | null = language ? 'fence' : null;

  // 只有完全没写语言的围栏才自动识别；写了未知语言/plaintext 就尊重作者的意图。
  if (resolution.kind === 'none') {
    language = detectCodeLanguage(code);
    source = language ? 'detected' : null;
  }
  if (!language) return remember(key, plainResult(null, null));
  if (code.length > MAX_CODE_LENGTH || code.split('\n').length > MAX_CODE_LINES) {
    return remember(key, plainResult(language, source));
  }

  const highlighter = await getHighlighter();
  if (!highlighter) return remember(key, plainResult(language, source));

  try {
    await ensureLanguage(highlighter, language);
    const html = highlighter.codeToHtml(code, {
      lang: language,
      theme: ABS_CODE_THEME_NAME,
      structure: 'inline',
    });
    return remember(key, { html, language, source });
  } catch {
    return remember(key, plainResult(language, source));
  }
}

/**
 * 给一段围栏代码着色。
 *
 * `fenceInfo` 是围栏后面的语言标记（可空）；同一个代码块在输入过程中会被
 * 反复调用，结果按「语言 + 源码」缓存，避免每次按键都重新 tokenize。
 */
export function highlightCode(code: string, fenceInfo: string | null | undefined): Promise<HighlightResult> {
  const resolution = resolveCodeLanguage(fenceInfo);
  const languageKey = resolution.kind === 'language' ? resolution.id : resolution.kind;
  const key = `${languageKey}\u0000${code}`;

  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const running = inFlight.get(key);
  if (running) return running;

  const task = run(key, code, resolution).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, task);
  return task;
}
