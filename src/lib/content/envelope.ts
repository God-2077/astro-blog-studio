import { base64ToBytes, bytesToBase64, decodeUtf8, encodeUtf8 } from '@/lib/utils/encoding';
import { decryptBytes, encryptBytes } from '@/lib/vault/crypto';

export const CONTENT_ENVELOPE_VERSION = 1;

/**
 * Ciphertext protects the whole record (meta or one article). `savedAt`/`size`
 * stay readable so quota pruning and integrity checks do not need the key; the
 * AEAD tag alone already detects tampering.
 */
export interface ContentEnvelope {
  v: typeof CONTENT_ENVELOPE_VERSION;
  alg: 'AES-GCM';
  iv: string;
  ciphertext: string;
  savedAt: number;
  size: number;
}

export function isContentEnvelope(value: unknown): value is ContentEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Partial<ContentEnvelope>;
  return (
    raw.v === CONTENT_ENVELOPE_VERSION &&
    raw.alg === 'AES-GCM' &&
    typeof raw.iv === 'string' &&
    typeof raw.ciphertext === 'string' &&
    typeof raw.savedAt === 'number' &&
    Number.isFinite(raw.savedAt) &&
    typeof raw.size === 'number' &&
    Number.isFinite(raw.size)
  );
}

/** AAD binds the record to its repo slot, so a copied row cannot be opened elsewhere. */
export function contentMetaAad(repoKey: string): string {
  return `abs:content:v1|meta|${repoKey}`;
}

/** AAD binds one article record to its path and blob sha. */
export function contentFileAad(repoKey: string, path: string, sha: string): string {
  return `abs:content:v1|file|${repoKey}|${path}|${sha}`;
}

export async function sealContent(value: unknown, key: CryptoKey, aad: string, savedAt: number): Promise<ContentEnvelope> {
  const plaintext = encodeUtf8(JSON.stringify(value));
  const encrypted = await encryptBytes(key, plaintext, aad);
  return {
    v: CONTENT_ENVELOPE_VERSION,
    alg: 'AES-GCM',
    iv: bytesToBase64(encrypted.iv),
    ciphertext: bytesToBase64(encrypted.ciphertext),
    savedAt,
    size: plaintext.length,
  };
}

/** Returns null for a wrong key, a tampered record, a cross-slot copy or a bad shape. */
export async function openContent<T>(
  envelope: ContentEnvelope,
  key: CryptoKey,
  aad: string,
  validate: (value: unknown) => value is T,
): Promise<T | null> {
  try {
    const plaintext = await decryptBytes(key, base64ToBytes(envelope.iv), base64ToBytes(envelope.ciphertext), aad);
    if (plaintext.length !== envelope.size) return null;
    const parsed: unknown = JSON.parse(decodeUtf8(plaintext));
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
