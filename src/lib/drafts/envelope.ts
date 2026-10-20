import { base64ToBytes, bytesToBase64, decodeUtf8, encodeUtf8 } from '@/lib/utils/encoding';
import { decryptBytes, encryptBytes } from '@/lib/vault/crypto';
import { type DraftRecord, isDraftRecord } from './model';

export const DRAFT_ENVELOPE_VERSION = 1;

/**
 * Same AES-GCM envelope shape as autosave backups: the whole draft record is
 * ciphertext, while `savedAt`/`size` stay readable for sorting and quota
 * messages. Both are bound into the AAD, so editing either breaks decryption.
 */
export interface DraftEnvelope {
  v: typeof DRAFT_ENVELOPE_VERSION;
  alg: 'AES-GCM';
  iv: string;
  ciphertext: string;
  savedAt: number;
  size: number;
}

function draftAad(slot: string, savedAt: number, size: number): string {
  return `abs:draft:v1|${slot}|${savedAt}|${size}`;
}

export function isDraftEnvelope(value: unknown): value is DraftEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Partial<DraftEnvelope>;
  return (
    raw.v === DRAFT_ENVELOPE_VERSION &&
    raw.alg === 'AES-GCM' &&
    typeof raw.iv === 'string' &&
    typeof raw.ciphertext === 'string' &&
    typeof raw.savedAt === 'number' &&
    Number.isFinite(raw.savedAt) &&
    typeof raw.size === 'number' &&
    Number.isFinite(raw.size)
  );
}

export async function sealDraft(record: DraftRecord, key: CryptoKey, slot: string): Promise<DraftEnvelope> {
  const encrypted = await encryptBytes(key, encodeUtf8(JSON.stringify(record)), draftAad(slot, record.savedAt, record.size));
  return {
    v: DRAFT_ENVELOPE_VERSION,
    alg: 'AES-GCM',
    iv: bytesToBase64(encrypted.iv),
    ciphertext: bytesToBase64(encrypted.ciphertext),
    savedAt: record.savedAt,
    size: record.size,
  };
}

/** Returns null for a wrong key, a tampered envelope, a cross-slot copy or a bad shape. */
export async function openDraft(envelope: DraftEnvelope, key: CryptoKey, slot: string): Promise<DraftRecord | null> {
  try {
    const plaintext = await decryptBytes(
      key,
      base64ToBytes(envelope.iv),
      base64ToBytes(envelope.ciphertext),
      draftAad(slot, envelope.savedAt, envelope.size),
    );
    const parsed: unknown = JSON.parse(decodeUtf8(plaintext));
    if (!isDraftRecord(parsed)) return null;
    if (parsed.savedAt !== envelope.savedAt || parsed.size !== envelope.size) return null;
    return parsed;
  } catch {
    return null;
  }
}
