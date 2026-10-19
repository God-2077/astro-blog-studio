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
import { getDeviceId, getDeviceIdForSource } from './fingerprint';
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

export async function unlockWithPassword(payload: VaultPayload, password: string): Promise<VaultSecrets> {
  const wrap = payload.password;
  if (!wrap) throw new VaultError('NO_METHOD', '没有设置密码');
  try {
    const deviceId = wrap.requireDevice ? (await getDeviceId()).id : undefined;
    const kek = await deriveKek(passphraseForPassword(password, deviceId), base64ToBytes(wrap.salt), payload.kdf.iterations);
    const dataKey = await unwrapDataKey(wrap, kek, AAD_KEY_PASSWORD);
    return await secretsFromDataKey(payload, dataKey);
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError(
      'WRONG_PASSWORD',
      wrap.requireDevice
        ? '密码不正确，或本机指纹与设置时不一致。双因子要求同一台设备；仍无法解锁时只能重置保险库并重新输入 PAT。'
        : '密码错误，或者数据已损坏。',
    );
  }
}

export async function unlockWithDevice(payload: VaultPayload): Promise<VaultSecrets> {
  const wrap = payload.device;
  if (!wrap) throw new VaultError('NO_METHOD', '没有绑定这台设备');
  try {
    const deviceId = await getDeviceIdForSource(wrap.source);
    const kek = await deriveKek(passphraseForDevice(deviceId), base64ToBytes(wrap.salt), payload.kdf.iterations);
    const dataKey = await unwrapDataKey(wrap, kek, AAD_KEY_DEVICE);
    return await secretsFromDataKey(payload, dataKey);
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError('FINGERPRINT_CHANGED', '设备指纹已变化，请用密码解锁或重新绑定。');
  }
}
