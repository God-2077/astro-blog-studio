import { APP_NAME, APP_VERSION } from '@/lib/config/app-meta';
import { type RepoConfig, type RepoProfile, type Settings, settingsSchema } from '@/lib/config/schema';
import { repoTokenKey } from '@/lib/repos/identity';
import type { VaultModeState } from '@/lib/vault/mode';

export const CONFIG_EXPORT_FORMAT = 'astro-blog-studio/config-export';
export const CONFIG_EXPORT_VERSION = 1;

export type ConfigExportSource = 'live' | 'demo';

export interface ConfigExportDocument {
  format: typeof CONFIG_EXPORT_FORMAT;
  version: typeof CONFIG_EXPORT_VERSION;
  exportedAt: string;
  app: {
    name: string;
    version: string;
  };
  source: ConfigExportSource;
  settings: Settings;
  /** 各仓库 PAT 明文，key 为小写 owner/name；此文档绝不能写入浏览器存储。 */
  tokens: Record<string, string>;
}

export class ConfigExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigExportError';
  }
}

export interface ExportTokenCollection {
  tokens: Record<string, string>;
  missing: string[];
}

/**
 * 每个仓库档案收集一个 PAT：优先用保险库里的加密令牌；旧版单令牌槽位只
 * 回退给活动仓库，非活动仓库永远不用它。
 */
export function collectExportTokens(
  profiles: readonly RepoProfile[],
  activeRepo: RepoConfig | null,
  storedTokens: Readonly<Record<string, string>>,
  legacyToken: string | null,
): ExportTokenCollection {
  const activeKey = activeRepo ? repoTokenKey(activeRepo) : null;
  const tokens = new Map<string, string>();
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const profile of profiles) {
    const key = repoTokenKey(profile);
    if (seen.has(key)) continue;
    seen.add(key);

    const stored = Object.hasOwn(storedTokens, key) ? storedTokens[key] : undefined;
    const storedValue = typeof stored === 'string' ? stored.trim() : '';
    const legacyValue = key === activeKey && legacyToken ? legacyToken.trim() : '';
    const token = storedValue || legacyValue;

    if (token) tokens.set(key, token);
    else missing.push(`${profile.owner}/${profile.name}`);
  }

  return { tokens: Object.fromEntries(tokens), missing };
}

/** 只用已保存的设置构建自描述 JSON 文档，绝不读取设置页的表单状态。 */
export function buildConfigExport({
  settings,
  tokens,
  source,
  now = new Date(),
}: {
  settings: Settings;
  tokens: Readonly<Record<string, string>>;
  source: ConfigExportSource;
  now?: Date;
}): ConfigExportDocument {
  const normalized = settingsSchema.parse(settings);
  const sortedTokens = Object.fromEntries(
    Object.entries(tokens)
      .map(([key, value]) => [key, value] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );

  return {
    format: CONFIG_EXPORT_FORMAT,
    version: CONFIG_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    app: {
      name: APP_NAME,
      version: APP_VERSION,
    },
    source,
    settings: normalized,
    tokens: sortedTokens,
  };
}

/**
 * 只有普通「密码」模式才要求再次输入密码；双因子与旧版混合模式沿用现有
 * 解锁流程，demo 没有保险库。
 */
export function requiresExportPassword(mode: VaultModeState | null): boolean {
  return mode === 'password';
}

/** 用 UTC 时间戳生成本地文件名，避免时区不同导致测试与文件名不一致。 */
export function configExportFilename(now: Date): string {
  const iso = now.toISOString();
  const stamp = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
  return `astro-blog-studio-config-${stamp}.json`;
}
