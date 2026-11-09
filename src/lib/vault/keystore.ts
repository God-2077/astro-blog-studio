import { t } from '@/lib/i18n';
import { base64ToBytes, bytesToBase64, decodeUtf8, encodeUtf8 } from '@/lib/utils/encoding';
import {
  AAD_KEY_DEVICE,
  AAD_KEY_PASSWORD,
  AAD_TOKEN,
  DEFAULT_ITERATIONS,
  decryptBytes,
  deriveKek,
  encryptBytes,
  importAesKey,
  passphraseForDevice,
  passphraseForPassword,
  randomBytes,
  repoTokenAad,
} from './crypto';
import { type DeviceId, getAllDeviceIdCandidates, getDeviceId, getDeviceIdCandidates } from './fingerprint';
import { MIN_VAULT_PASSWORD_LENGTH, modeNeedsPassword, type VaultMode, type VaultModeState } from './mode';

export const VAULT_STORAGE_KEY = 'abs.vault.v1';

export interface WrappedKey {
  salt: string;
  iv: string;
  wrappedKey: string;
}

export interface EncryptedToken {
  iv: string;
  ciphertext: string;
}

export interface DeviceWrap extends WrappedKey {
  source: 'fpjs' | 'local';
}

export interface PasswordWrap extends WrappedKey {
  /**
   * Legacy field name: when true the password KEK mixes in the device
   * fingerprint, so the password and this device are both required. New
   * two-factor vaults use it and never store an independent device wrap.
   */
  requireDevice: boolean;
}

export interface VaultPayload {
  v: 1;
  kdf: { name: 'PBKDF2-SHA256'; iterations: number };
  device?: DeviceWrap;
  password?: PasswordWrap;
  /** Legacy single-PAT envelope, migrated to `tokens` after the first unlock. */
  token?: EncryptedToken;
  /**
   * Per-repository PATs keyed by `owner/name` (lowercase). Each envelope's AAD
   * is bound to its key, so ciphertexts cannot be swapped between repositories.
   */
  tokens?: Record<string, EncryptedToken>;
  createdAt: string;
}

export interface VaultSecrets {
  /** Legacy single PAT; null once all repositories use the token map. */
  token: string | null;
  tokens: Record<string, string>;
  dataKey: Uint8Array;
}

export type VaultErrorCode = 'WRONG_PASSWORD' | 'FINGERPRINT_CHANGED' | 'CORRUPT' | 'NO_METHOD' | 'INVALID_INPUT';

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
  }
}

function isEncryptedToken(value: unknown): value is EncryptedToken {
  if (!value || typeof value !== 'object') return false;
  const token = value as Partial<EncryptedToken>;
  return typeof token.iv === 'string' && typeof token.ciphertext === 'string';
}

const RESERVED_TOKEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isTokenMap(value: unknown): value is Record<string, EncryptedToken> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    entries.every(([key, token]) => key.length > 0 && !RESERVED_TOKEN_KEYS.has(key) && isEncryptedToken(token))
  );
}

function isVaultPayload(value: unknown): value is VaultPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<VaultPayload>;
  if (payload.v !== 1 || payload.kdf?.name !== 'PBKDF2-SHA256') return false;
  if (!isEncryptedToken(payload.token) && !isTokenMap(payload.tokens)) return false;
  return typeof payload.createdAt === 'string';
}

export function loadVault(): VaultPayload | null {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isVaultPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveVault(payload: VaultPayload): void {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(payload));
}

export function clearVault(): void {
  localStorage.removeItem(VAULT_STORAGE_KEY);
}

/**
 * How the existing payload is unlocked. `legacy-mixed` is only produced by
 * older versions that stored a device wrap next to a password wrap; new vaults
 * never have both, which is what makes `密码 + 设备双因子` a real AND.
 */
export function vaultModeOf(payload: VaultPayload | null): VaultModeState | null {
  if (!payload) return null;
  const hasDevice = Boolean(payload.device);
  const hasPassword = Boolean(payload.password);
  if (hasDevice && hasPassword) return 'legacy-mixed';
  if (hasDevice) return 'device';
  if (hasPassword) return payload.password?.requireDevice ? 'two-factor' : 'password';
  return null;
}

async function wrapDataKey(key: Uint8Array, kek: CryptoKey, aad: string): Promise<WrappedKey> {
  const encrypted = await encryptBytes(kek, key, aad);
  return {
    salt: '',
    iv: bytesToBase64(encrypted.iv),
    wrappedKey: bytesToBase64(encrypted.ciphertext),
  };
}

async function unwrapDataKey(wrap: WrappedKey, kek: CryptoKey, aad: string): Promise<Uint8Array> {
  return decryptBytes(kek, base64ToBytes(wrap.iv), base64ToBytes(wrap.wrappedKey), aad);
}

async function wrapWithDevice(
  dataKey: Uint8Array,
  deviceId: string,
  source: 'fpjs' | 'local',
  iterations: number,
): Promise<DeviceWrap> {
  const salt = randomBytes(16);
  const kek = await deriveKek(passphraseForDevice(deviceId), salt, iterations);
  const wrapped = await wrapDataKey(dataKey, kek, AAD_KEY_DEVICE);
  return { ...wrapped, salt: bytesToBase64(salt), source };
}

async function wrapWithPassword(
  dataKey: Uint8Array,
  password: string,
  requireDevice: boolean,
  deviceId: string | undefined,
  iterations: number,
): Promise<PasswordWrap> {
  const salt = randomBytes(16);
  const kek = await deriveKek(passphraseForPassword(password, requireDevice ? deviceId : undefined), salt, iterations);
  const wrapped = await wrapDataKey(dataKey, kek, AAD_KEY_PASSWORD);
  return { ...wrapped, salt: bytesToBase64(salt), requireDevice };
}

async function encryptToken(dataKey: Uint8Array, repoKey: string, token: string): Promise<EncryptedToken> {
  const tokenKey = await importAesKey(dataKey);
  const encrypted = await encryptBytes(tokenKey, encodeUtf8(token), repoTokenAad(repoKey));
  return { iv: bytesToBase64(encrypted.iv), ciphertext: bytesToBase64(encrypted.ciphertext) };
}

async function encryptLegacyToken(dataKey: Uint8Array, token: string): Promise<EncryptedToken> {
  const tokenKey = await importAesKey(dataKey);
  const encrypted = await encryptBytes(tokenKey, encodeUtf8(token), AAD_TOKEN);
  return { iv: bytesToBase64(encrypted.iv), ciphertext: bytesToBase64(encrypted.ciphertext) };
}

interface BuildPayloadInput {
  tokens: Record<string, string>;
  legacyToken?: string;
  dataKey: Uint8Array;
  mode: VaultMode;
  password?: string;
  iterations: number;
}

function normalizeTokens(tokens: Record<string, string>): Array<[string, string]> {
  return Object.entries(tokens)
    .map(([key, token]) => [key.trim(), token.trim()] as const)
    .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1]));
}

async function buildPayload(input: BuildPayloadInput): Promise<VaultPayload> {
  if (modeNeedsPassword(input.mode)) {
    if (!input.password || input.password.length < MIN_VAULT_PASSWORD_LENGTH) {
      throw new VaultError('INVALID_INPUT', t('errors.vault.passwordTooShort', { count: MIN_VAULT_PASSWORD_LENGTH }));
    }
  }

  const tokens: Record<string, EncryptedToken> = {};
  for (const [repoKey, token] of normalizeTokens(input.tokens)) {
    tokens[repoKey] = await encryptToken(input.dataKey, repoKey, token);
  }
  if (Object.keys(tokens).length === 0 && !input.legacyToken) {
    throw new VaultError('INVALID_INPUT', t('errors.vault.needsToken'));
  }

  const legacy = input.legacyToken ? await encryptLegacyToken(input.dataKey, input.legacyToken) : undefined;

  let device: DeviceWrap | undefined;
  let password: PasswordWrap | undefined;

  if (input.mode === 'device') {
    const deviceId = await getDeviceId();
    device = await wrapWithDevice(input.dataKey, deviceId.id, deviceId.source, input.iterations);
  } else if (input.mode === 'two-factor') {
    // The device is mixed into the password KEK instead of getting its own
    // wrap: no credential can unwrap the data key without the other factor.
    const deviceId = await getDeviceId();
    password = await wrapWithPassword(input.dataKey, input.password as string, true, deviceId.id, input.iterations);
  } else {
    password = await wrapWithPassword(input.dataKey, input.password as string, false, undefined, input.iterations);
  }

  return {
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations: input.iterations },
    ...(device ? { device } : {}),
    ...(password ? { password } : {}),
    ...(Object.keys(tokens).length > 0 ? { tokens } : {}),
    ...(legacy ? { token: legacy } : {}),
    createdAt: new Date().toISOString(),
  };
}

export interface CreateVaultInput {
  repoKey: string;
  token: string;
  mode: VaultMode;
  password?: string;
  iterations?: number;
}

export interface CreatedVault {
  payload: VaultPayload;
  dataKey: Uint8Array;
}

export interface CreateVaultWithTokensInput {
  tokens: Record<string, string>;
  mode: VaultMode;
  password?: string;
  iterations?: number;
}

export interface CreatedVaultWithTokens extends CreatedVault {
  /** Trimmed tokens that were actually encrypted, for this session's PAT map. */
  tokens: Record<string, string>;
}

/** Create a first vault from an imported configuration (one PAT per repository). */
export async function createVaultWithTokens(input: CreateVaultWithTokensInput): Promise<CreatedVaultWithTokens> {
  const entries = normalizeTokens(input.tokens);
  if (entries.length === 0) {
    throw new VaultError('INVALID_INPUT', t('errors.vault.needsToken'));
  }
  const dataKey = randomBytes(32);
  const tokens = Object.fromEntries(entries);
  const payload = await buildPayload({
    tokens,
    dataKey,
    mode: input.mode,
    ...(input.password ? { password: input.password } : {}),
    iterations: input.iterations ?? DEFAULT_ITERATIONS,
  });
  saveVault(payload);
  return { payload, dataKey, tokens };
}

export async function createVault(input: CreateVaultInput): Promise<CreatedVault> {
  if (!input.repoKey.trim() || !input.token.trim()) {
    throw new VaultError('INVALID_INPUT', t('errors.vault.repoTokenEmpty'));
  }
  const dataKey = randomBytes(32);
  const payload = await buildPayload({
    tokens: { [input.repoKey]: input.token },
    dataKey,
    mode: input.mode,
    ...(input.password ? { password: input.password } : {}),
    iterations: input.iterations ?? DEFAULT_ITERATIONS,
  });
  saveVault(payload);
  return { payload, dataKey };
}

export interface RewrapInput {
  tokens: Record<string, string>;
  legacyToken?: string | null;
  dataKey: Uint8Array;
  mode: VaultMode;
  password?: string;
  iterations?: number;
}

/**
 * Change the unlock mode/password while already unlocked. The data key is
 * deliberately preserved: backups encrypted with the derived key must stay
 * readable after the change. Every repository PAT is re-encrypted in place.
 */
export async function rewrapVault(input: RewrapInput): Promise<VaultPayload> {
  const payload = await buildPayload({
    tokens: input.tokens,
    ...(input.legacyToken ? { legacyToken: input.legacyToken } : {}),
    dataKey: input.dataKey,
    mode: input.mode,
    ...(input.password ? { password: input.password } : {}),
    iterations: input.iterations ?? DEFAULT_ITERATIONS,
  });
  saveVault(payload);
  return payload;
}

async function decryptSecrets(payload: VaultPayload, dataKey: Uint8Array): Promise<Omit<VaultSecrets, 'dataKey'>> {
  const tokenKey = await importAesKey(dataKey);
  const tokens: Record<string, string> = {};
  for (const [repoKey, envelope] of Object.entries(payload.tokens ?? {})) {
    try {
      const plaintext = await decryptBytes(
        tokenKey,
        base64ToBytes(envelope.iv),
        base64ToBytes(envelope.ciphertext),
        repoTokenAad(repoKey),
      );
      tokens[repoKey] = decodeUtf8(plaintext);
    } catch {
      throw new VaultError('CORRUPT', t('errors.vault.repoTokenCorrupt'));
    }
  }

  let legacyToken: string | null = null;
  if (payload.token) {
    try {
      const plaintext = await decryptBytes(
        tokenKey,
        base64ToBytes(payload.token.iv),
        base64ToBytes(payload.token.ciphertext),
        AAD_TOKEN,
      );
      legacyToken = decodeUtf8(plaintext);
    } catch {
      throw new VaultError('CORRUPT', t('errors.vault.tokenCorrupt'));
    }
  }

  if (!legacyToken && Object.keys(tokens).length === 0) {
    throw new VaultError('CORRUPT', t('errors.vault.noUsableToken'));
  }
  return { token: legacyToken, tokens };
}

async function secretsFromDataKey(payload: VaultPayload, dataKey: Uint8Array): Promise<VaultSecrets> {
  return { ...(await decryptSecrets(payload, dataKey)), dataKey };
}

function fingerprintChangedMessage(payload: VaultPayload): string {
  return payload.password ? t('errors.vault.fingerprintChanged') : t('errors.vault.fingerprintChangedNoPassword');
}

/**
 * 旧版保险库绑定的是「含窗口尺寸/渲染测量」的旧指纹；用旧指纹解锁成功后把包装重绑到
 * 当前稳定指纹，这样下一次改变窗口或重新加载时不会再失败。迁移是 best-effort：
 * 写 localStorage 失败也不能影响这次解锁。
 */
async function migrateWraps(payload: VaultPayload, dataKey: Uint8Array, target: DeviceId, password?: string): Promise<void> {
  try {
    const device = payload.device ? await wrapWithDevice(dataKey, target.id, target.source, payload.kdf.iterations) : undefined;
    const passwordWrap =
      payload.password && password
        ? await wrapWithPassword(dataKey, password, payload.password.requireDevice, target.id, payload.kdf.iterations)
        : undefined;
    saveVault({ ...payload, ...(device ? { device } : {}), ...(passwordWrap ? { password: passwordWrap } : {}) });
  } catch {
    // Keep the vault usable even if localStorage is full or unavailable.
  }
}

/** 找出这次解锁用到的旧指纹，并返回应迁移到的稳定指纹。 */
async function migrationTarget(
  payload: VaultPayload,
  matched: DeviceId | undefined,
  candidates: DeviceId[],
): Promise<DeviceId | undefined> {
  if (matched) {
    const primary = candidates[0];
    return primary && primary.id !== matched.id ? primary : undefined;
  }
  // 密码路径不消耗指纹（例如旧版「密码或指纹」保险库），但其中的设备包装仍可能绑着旧指纹。
  return payload.device ? getDeviceId() : undefined;
}

interface PasswordUnwrap {
  dataKey: Uint8Array;
  matched?: DeviceId;
  candidates: DeviceId[];
  requireDevice: boolean;
}

/** 只从密码信封解包保险库数据密钥；PAT 信封保持原样。 */
async function unwrapPasswordDataKey(payload: VaultPayload, password: string): Promise<PasswordUnwrap> {
  const wrap = payload.password;
  if (!wrap) throw new VaultError('NO_METHOD', t('errors.vault.noPassword'));
  const candidates = wrap.requireDevice ? await getAllDeviceIdCandidates() : [];
  if (wrap.requireDevice && candidates.length === 0) {
    throw new VaultError('FINGERPRINT_CHANGED', t('errors.vault.fingerprintUnreadableReset'));
  }
  // 旧版双因子保险库的密码 KEK 混入的是旧指纹：逐个候选尝试，命中旧指纹后自动迁移。
  const deviceIds: Array<DeviceId | undefined> = wrap.requireDevice ? candidates : [undefined];
  let matched: DeviceId | undefined;
  let dataKey: Uint8Array | undefined;
  for (const deviceId of deviceIds) {
    try {
      const kek = await deriveKek(
        passphraseForPassword(password, deviceId?.id),
        base64ToBytes(wrap.salt),
        payload.kdf.iterations,
      );
      dataKey = await unwrapDataKey(wrap, kek, AAD_KEY_PASSWORD);
      matched = deviceId;
      break;
    } catch {
      // Try the next candidate.
    }
  }
  if (!dataKey) {
    throw new VaultError(
      'WRONG_PASSWORD',
      t(wrap.requireDevice ? 'errors.vault.wrongPasswordTwoFactor' : 'errors.vault.wrongPassword'),
    );
  }
  return { dataKey, matched, candidates, requireDevice: wrap.requireDevice };
}

export async function unlockWithPassword(payload: VaultPayload, password: string): Promise<VaultSecrets> {
  const { dataKey, matched, candidates, requireDevice } = await unwrapPasswordDataKey(payload, password);
  const secrets = await secretsFromDataKey(payload, dataKey);
  const target = await migrationTarget(payload, matched, candidates);
  if (target) await migrateWraps(payload, dataKey, target, requireDevice ? password : undefined);
  return secrets;
}

/**
 * 校验保险库密码：不解密仓库 PAT、不迁移解锁方式包装，也不写 localStorage。
 * 供导出配置前的密码复核使用。
 */
export async function verifyVaultPassword(password: string): Promise<void> {
  const payload = loadVault();
  if (!payload) throw new VaultError('NO_METHOD', t('errors.vault.notFound'));
  if (!payload.password) throw new VaultError('NO_METHOD', t('errors.vault.noPassword'));
  await unwrapPasswordDataKey(payload, password);
}

export async function unlockWithDevice(payload: VaultPayload): Promise<VaultSecrets> {
  const wrap = payload.device;
  if (!wrap) throw new VaultError('NO_METHOD', t('errors.vault.noDevice'));
  const candidates = await getDeviceIdCandidates(wrap.source);
  if (candidates.length === 0) {
    throw new VaultError('FINGERPRINT_CHANGED', t('errors.vault.fingerprintUnreadableUnlock'));
  }
  // 候选顺序：当前稳定指纹 → 旧算法指纹（旧保险库兼容）。
  let matched: DeviceId | undefined;
  let dataKey: Uint8Array | undefined;
  for (const candidate of candidates) {
    try {
      const kek = await deriveKek(passphraseForDevice(candidate.id), base64ToBytes(wrap.salt), payload.kdf.iterations);
      dataKey = await unwrapDataKey(wrap, kek, AAD_KEY_DEVICE);
      matched = candidate;
      break;
    } catch {
      // Try the next candidate.
    }
  }
  if (!dataKey) throw new VaultError('FINGERPRINT_CHANGED', fingerprintChangedMessage(payload));
  const secrets = await secretsFromDataKey(payload, dataKey);
  const primary = candidates[0];
  if (matched && primary && matched.id !== primary.id) await migrateWraps(payload, dataKey, primary);
  return secrets;
}

/** Add or replace one repository's PAT without touching the other envelopes. */
export async function addRepoTokenToVault(
  payload: VaultPayload,
  dataKey: Uint8Array,
  repoKey: string,
  token: string,
): Promise<VaultPayload> {
  const key = repoKey.trim();
  const value = token.trim();
  if (!key || !value) throw new VaultError('INVALID_INPUT', t('errors.vault.repoTokenEmpty'));
  const next: VaultPayload = {
    ...payload,
    tokens: { ...(payload.tokens ?? {}), [key]: await encryptToken(dataKey, key, value) },
  };
  saveVault(next);
  return next;
}

/** Replace the entire repository PAT map in one write and drop the legacy slot. */
export async function replaceRepoTokensInVault(
  payload: VaultPayload,
  dataKey: Uint8Array,
  tokens: Readonly<Record<string, string>>,
): Promise<VaultPayload> {
  const entries = normalizeTokens({ ...tokens });
  if (entries.length === 0) throw new VaultError('INVALID_INPUT', t('errors.vault.needsToken'));
  const encrypted: Record<string, EncryptedToken> = {};
  for (const [repoKey, token] of entries) {
    if (RESERVED_TOKEN_KEYS.has(repoKey)) throw new VaultError('INVALID_INPUT', t('errors.vault.repoTokenEmpty'));
    encrypted[repoKey] = await encryptToken(dataKey, repoKey, token);
  }
  const next: VaultPayload = { ...payload, tokens: encrypted };
  delete next.token;
  saveVault(next);
  return next;
}

/** Remove one repository's PAT; the active repository's token is never removed. */
export function removeRepoTokenFromVault(payload: VaultPayload, repoKey: string): VaultPayload {
  const tokens = { ...(payload.tokens ?? {}) };
  delete tokens[repoKey];
  if (Object.keys(tokens).length === 0 && !payload.token) {
    throw new VaultError('INVALID_INPUT', t('errors.vault.lastToken'));
  }
  const next: VaultPayload = { ...payload };
  if (Object.keys(tokens).length > 0) next.tokens = tokens;
  else delete next.tokens;
  saveVault(next);
  return next;
}

/**
 * Migrate the old single-PAT envelope to the currently active repository. The
 * token is re-encrypted with a repository-bound AAD and the legacy field is
 * removed in the same atomic localStorage write.
 */
export async function migrateLegacyTokenToRepo(
  payload: VaultPayload,
  dataKey: Uint8Array,
  legacyToken: string,
  repoKey: string,
): Promise<VaultPayload> {
  const key = repoKey.trim();
  if (!key || !legacyToken) throw new VaultError('INVALID_INPUT', t('errors.vault.noLegacyToken'));
  const tokens = { ...(payload.tokens ?? {}) };
  if (!tokens[key]) tokens[key] = await encryptToken(dataKey, key, legacyToken);
  const next: VaultPayload = { ...payload, tokens };
  delete next.token;
  saveVault(next);
  return next;
}
