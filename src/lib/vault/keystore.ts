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
} from './crypto';
import { type DeviceId, getAllDeviceIdCandidates, getDeviceId, getDeviceIdCandidates } from './fingerprint';
import { MIN_VAULT_PASSWORD_LENGTH, modeNeedsPassword, type VaultMode, type VaultModeState } from './mode';

export const VAULT_STORAGE_KEY = 'abs.vault.v1';

export interface WrappedKey {
  salt: string;
  iv: string;
  wrappedKey: string;
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
  token: { iv: string; ciphertext: string };
  createdAt: string;
}

export interface VaultSecrets {
  token: string;
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

function isVaultPayload(value: unknown): value is VaultPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<VaultPayload>;
  return (
    payload.v === 1 &&
    payload.kdf?.name === 'PBKDF2-SHA256' &&
    typeof payload.token?.iv === 'string' &&
    typeof payload.token?.ciphertext === 'string'
  );
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

interface BuildPayloadInput {
  token: string;
  dataKey: Uint8Array;
  mode: VaultMode;
  password?: string;
  iterations: number;
}

async function buildPayload(input: BuildPayloadInput): Promise<VaultPayload> {
  if (modeNeedsPassword(input.mode)) {
    if (!input.password || input.password.length < MIN_VAULT_PASSWORD_LENGTH) {
      throw new VaultError('INVALID_INPUT', `密码至少 ${MIN_VAULT_PASSWORD_LENGTH} 位`);
    }
  }

  const tokenKey = await importAesKey(input.dataKey);
  const encryptedToken = await encryptBytes(tokenKey, encodeUtf8(input.token), AAD_TOKEN);

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
    token: {
      iv: bytesToBase64(encryptedToken.iv),
      ciphertext: bytesToBase64(encryptedToken.ciphertext),
    },
    createdAt: new Date().toISOString(),
  };
}

export interface CreateVaultInput {
  token: string;
  mode: VaultMode;
  password?: string;
  iterations?: number;
}

export interface CreatedVault {
  payload: VaultPayload;
  dataKey: Uint8Array;
}

export async function createVault(input: CreateVaultInput): Promise<CreatedVault> {
  const dataKey = randomBytes(32);
  const payload = await buildPayload({
    token: input.token,
    dataKey,
    mode: input.mode,
    ...(input.password ? { password: input.password } : {}),
    iterations: input.iterations ?? DEFAULT_ITERATIONS,
  });
  saveVault(payload);
  return { payload, dataKey };
}

export interface RewrapInput {
  token: string;
  dataKey: Uint8Array;
  mode: VaultMode;
  password?: string;
  iterations?: number;
}

/**
 * Change the unlock mode/password while already unlocked. The data key is
 * deliberately preserved: backups encrypted with the derived key must stay
 * readable after the change.
 */
export async function rewrapVault(input: RewrapInput): Promise<VaultPayload> {
  const payload = await buildPayload({
    token: input.token,
    dataKey: input.dataKey,
    mode: input.mode,
    ...(input.password ? { password: input.password } : {}),
    iterations: input.iterations ?? DEFAULT_ITERATIONS,
  });
  saveVault(payload);
  return payload;
}

async function decryptToken(payload: VaultPayload, dataKey: Uint8Array): Promise<string> {
  const tokenKey = await importAesKey(dataKey);
  const tokenBytes = await decryptBytes(
    tokenKey,
    base64ToBytes(payload.token.iv),
    base64ToBytes(payload.token.ciphertext),
    AAD_TOKEN,
  );
  return decodeUtf8(tokenBytes);
}

async function secretsFromDataKey(payload: VaultPayload, dataKey: Uint8Array): Promise<VaultSecrets> {
  return { token: await decryptToken(payload, dataKey), dataKey };
}

function fingerprintChangedMessage(payload: VaultPayload): string {
  return payload.password
    ? '设备指纹已变化，请用密码解锁或重新绑定。'
    : '设备指纹已变化，无法自动解锁。请重置保险库并重新输入 PAT。';
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

export async function unlockWithPassword(payload: VaultPayload, password: string): Promise<VaultSecrets> {
  const wrap = payload.password;
  if (!wrap) throw new VaultError('NO_METHOD', '没有设置密码');
  const candidates = wrap.requireDevice ? await getAllDeviceIdCandidates() : [];
  if (wrap.requireDevice && candidates.length === 0) {
    throw new VaultError('FINGERPRINT_CHANGED', '无法读取当前设备指纹，请重置保险库后重新输入 PAT。');
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
      wrap.requireDevice
        ? '密码不正确，或本机指纹与设置时不一致。双因子要求同一台设备；仍无法解锁时只能重置保险库并重新输入 PAT。'
        : '密码错误，或者数据已损坏。',
    );
  }
  let secrets: VaultSecrets;
  try {
    secrets = await secretsFromDataKey(payload, dataKey);
  } catch {
    throw new VaultError('WRONG_PASSWORD', '密码错误，或者数据已损坏。');
  }
  const target = await migrationTarget(payload, matched, candidates);
  if (target) await migrateWraps(payload, dataKey, target, wrap.requireDevice ? password : undefined);
  return secrets;
}

export async function unlockWithDevice(payload: VaultPayload): Promise<VaultSecrets> {
  const wrap = payload.device;
  if (!wrap) throw new VaultError('NO_METHOD', '没有绑定这台设备');
  const candidates = await getDeviceIdCandidates(wrap.source);
  if (candidates.length === 0) {
    throw new VaultError('FINGERPRINT_CHANGED', '无法读取当前设备指纹，请用密码解锁或重置保险库后重新输入 PAT。');
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
  let secrets: VaultSecrets;
  try {
    secrets = await secretsFromDataKey(payload, dataKey);
  } catch {
    throw new VaultError('CORRUPT', '保险库数据已损坏，请重置保险库后重新输入 PAT。');
  }
  const primary = candidates[0];
  if (matched && primary && matched.id !== primary.id) await migrateWraps(payload, dataKey, primary);
  return secrets;
}
