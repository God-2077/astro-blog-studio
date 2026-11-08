import { CONFIG_EXPORT_FORMAT, CONFIG_EXPORT_VERSION, type ConfigExportSource } from '@/lib/config/export';
import { type Settings, settingsSchema } from '@/lib/config/schema';
import { repoProfileKey, repoTokenKey } from '@/lib/repos/identity';
import { allRepoProfiles } from '@/lib/repos/profile';

export type ConfigImportErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_FORMAT'
  | 'INVALID_VERSION'
  | 'INVALID_SETTINGS'
  | 'INVALID_TOKENS'
  | 'DEMO_SOURCE'
  | 'NO_ACTIVE_REPO'
  | 'DUPLICATE_REPO'
  | 'MISSING_PAT';

export class ConfigImportError extends Error {
  readonly code: ConfigImportErrorCode;
  readonly missing: string[];

  constructor(code: ConfigImportErrorCode, message = code, missing: string[] = []) {
    super(message);
    this.name = 'ConfigImportError';
    this.code = code;
    this.missing = missing;
  }
}

export interface ParsedConfigImport {
  settings: Settings;
  tokens: Record<string, string>;
  source: ConfigExportSource;
  exportedAt: string;
  repoCount: number;
  tokenCount: number;
}

const RESERVED_TOKEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const TOKEN_KEY_PATTERN = /^[^/\s]+\/[^/\s]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTokenKey(value: string): string | null {
  const key = value.trim().toLowerCase();
  if (!TOKEN_KEY_PATTERN.test(key) || RESERVED_TOKEN_KEYS.has(key)) return null;
  return key;
}

function readTokens(value: unknown): Record<string, string> {
  if (!isRecord(value)) throw new ConfigImportError('INVALID_TOKENS');
  const tokens = new Map<string, string>();
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = normalizeTokenKey(rawKey);
    if (!key || typeof rawValue !== 'string') throw new ConfigImportError('INVALID_TOKENS');
    const token = rawValue.trim();
    if (!token || tokens.has(key)) throw new ConfigImportError('INVALID_TOKENS');
    tokens.set(key, token);
  }
  return Object.fromEntries([...tokens].sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * 解析设置页导出的 JSON。只接受 live 配置；demo 文件没有 PAT，不能用于恢复真实仓库。
 * 导入是整体替换：所有导入仓库都必须带 PAT，文件里多余的 token 会被忽略。
 */
export function parseConfigImport(text: string): ParsedConfigImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ConfigImportError('INVALID_JSON');
  }
  if (!isRecord(raw)) throw new ConfigImportError('INVALID_FORMAT');
  if (raw.format !== CONFIG_EXPORT_FORMAT) throw new ConfigImportError('INVALID_FORMAT');
  if (raw.version !== CONFIG_EXPORT_VERSION) throw new ConfigImportError('INVALID_VERSION');
  if (raw.source === 'demo') throw new ConfigImportError('DEMO_SOURCE');
  if (raw.source !== 'live') throw new ConfigImportError('INVALID_FORMAT');

  const parsed = settingsSchema.safeParse(raw.settings);
  if (!parsed.success) throw new ConfigImportError('INVALID_SETTINGS');
  const settings = parsed.data;
  if (!settings.repo) throw new ConfigImportError('NO_ACTIVE_REPO');

  const tokens = readTokens(raw.tokens);
  const profiles = allRepoProfiles(settings);
  const seenProfiles = new Set<string>();
  for (const profile of profiles) {
    const key = repoProfileKey(profile);
    if (seenProfiles.has(key)) throw new ConfigImportError('DUPLICATE_REPO');
    seenProfiles.add(key);
  }

  const requiredTokenKeys = new Set<string>();
  const missing: string[] = [];
  for (const profile of profiles) {
    const tokenKey = repoTokenKey(profile);
    if (requiredTokenKeys.has(tokenKey)) continue;
    requiredTokenKeys.add(tokenKey);
    if (!Object.hasOwn(tokens, tokenKey)) missing.push(`${profile.owner}/${profile.name}`);
  }
  if (missing.length > 0) throw new ConfigImportError('MISSING_PAT', 'MISSING_PAT', missing);

  const requiredTokens = Object.fromEntries(Object.entries(tokens).filter(([key]) => requiredTokenKeys.has(key)));
  return {
    settings,
    tokens: requiredTokens,
    source: 'live',
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    repoCount: profiles.length,
    tokenCount: Object.keys(requiredTokens).length,
  };
}
