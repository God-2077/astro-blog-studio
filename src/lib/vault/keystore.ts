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

export type VaultErrorCode = 'WRONG_PASSWORD' | 'FINGERPRINT_CHANGED' | 'CORRUPT' | 'NO_METHOD';

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

export interface CreateVaultInput {
  token: string;
  password?: string;
  useDevice: boolean;
  requireDevice?: boolean;
  iterations?: number;
}

export async function createVault(input: CreateVaultInput): Promise<VaultPayload> {
  const iterations = input.iterations ?? DEFAULT_ITERATIONS;
  const dataKey = randomBytes(32);
  const tokenKey = await importAesKey(dataKey);
  const encryptedToken = await encryptBytes(tokenKey, encodeUtf8(input.token), AAD_TOKEN);

  const deviceId = input.useDevice ? await getDeviceId() : null;
  const device = deviceId ? await wrapWithDevice(dataKey, deviceId.id, deviceId.source, iterations) : undefined;
  const password = input.password
    ? await wrapWithPassword(dataKey, input.password, Boolean(input.requireDevice), deviceId?.id, iterations)
    : undefined;

  if (!device && !password) {
    throw new VaultError('NO_METHOD', '至少需要一种解锁方式');
  }

  const payload: VaultPayload = {
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations },
    ...(device ? { device } : {}),
    ...(password ? { password } : {}),
    token: {
      iv: bytesToBase64(encryptedToken.iv),
      ciphertext: bytesToBase64(encryptedToken.ciphertext),
    },
    createdAt: new Date().toISOString(),
  };

  saveVault(payload);
  return payload;
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

export async function unlockWithPassword(payload: VaultPayload, password: string): Promise<string> {
  const wrap = payload.password;
  if (!wrap) throw new VaultError('NO_METHOD', '没有设置密码');
  try {
    const deviceId = wrap.requireDevice ? (await getDeviceId()).id : undefined;
    const kek = await deriveKek(passphraseForPassword(password, deviceId), base64ToBytes(wrap.salt), payload.kdf.iterations);
    const dataKey = await unwrapDataKey(wrap, kek, AAD_KEY_PASSWORD);
    return await decryptToken(payload, dataKey);
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError('WRONG_PASSWORD', '密码错误，或者数据已损坏。');
  }
}

export async function unlockWithDevice(payload: VaultPayload): Promise<string> {
  const wrap = payload.device;
  if (!wrap) throw new VaultError('NO_METHOD', '没有绑定这台设备');
  try {
    const deviceId = await getDeviceIdForSource(wrap.source);
    const kek = await deriveKek(passphraseForDevice(deviceId), base64ToBytes(wrap.salt), payload.kdf.iterations);
    const dataKey = await unwrapDataKey(wrap, kek, AAD_KEY_DEVICE);
    return await decryptToken(payload, dataKey);
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError('FINGERPRINT_CHANGED', '设备指纹已变化，请用密码解锁或重新绑定。');
  }
}

export interface RewrapInput {
  token: string;
  password?: string;
  useDevice: boolean;
  requireDevice?: boolean;
  iterations?: number;
}

/** Unwrap with the current token, then wrap a fresh data key and token again. */
export async function rewrapVault(input: RewrapInput): Promise<VaultPayload> {
  return createVault(input);
}
