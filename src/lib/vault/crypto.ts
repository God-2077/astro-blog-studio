const encoder = new TextEncoder();

export const DEFAULT_ITERATIONS = 600_000;

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function deriveKek(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedBytes {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

export async function encryptBytes(key: CryptoKey, data: Uint8Array, aad: string): Promise<EncryptedBytes> {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(aad) },
    key,
    data as BufferSource,
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function decryptBytes(key: CryptoKey, iv: Uint8Array, ciphertext: Uint8Array, aad: string): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(aad) },
    key,
    ciphertext as BufferSource,
  );
  return new Uint8Array(plaintext);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Domain-separated key for the local unsaved-draft backups. Deriving it from the
 * vault data key means drafts are only readable while the vault is unlocked and
 * follow the same credential as the PAT.
 */
export const BACKUP_KEY_INFO = 'abs:backup:v1';

export async function deriveBackupKey(dataKey: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', dataKey as BufferSource, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: encoder.encode(BACKUP_KEY_INFO),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Domain-separated key for the locally cached articles. Same data key as the
 * vault, but a different HKDF info string so backups and the article cache can
 * never be cross-opened.
 */
export const CONTENT_KEY_INFO = 'abs:content:v1';

export async function deriveContentKey(dataKey: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', dataKey as BufferSource, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: encoder.encode(CONTENT_KEY_INFO),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function passphraseForDevice(id: string): string {
  return `abs:vault:v1|device|${id}`;
}

export function passphraseForPassword(password: string, deviceId?: string): string {
  return deviceId ? `abs:vault:v1|password|${deviceId}|${password}` : `abs:vault:v1|password|${password}`;
}

export const AAD_TOKEN = 'abs:token:v1';
export const AAD_KEY_DEVICE = 'abs:key:device:v1';
export const AAD_KEY_PASSWORD = 'abs:key:password:v1';
