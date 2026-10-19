import { base64ToBytes, bytesToBase64, decodeUtf8, encodeUtf8 } from '@/lib/utils/encoding';
import { decryptBytes, encryptBytes } from '@/lib/vault/crypto';
import { type BackupRecord, isBackupRecord } from './model';

export const BACKUP_ENVELOPE_VERSION = 2;

/**
 * The ciphertext protects the whole `BackupRecord` (body, frontmatter form and
 * restore state). `savedAt`/`size` stay readable so pruning and quota checks do
 * not need the vault key; they are also bound into the AAD, so flipping either
 * one makes decryption fail.
 */
export interface BackupEnvelope {
  v: typeof BACKUP_ENVELOPE_VERSION;
  alg: 'AES-GCM';
  iv: string;
  ciphertext: string;
  savedAt: number;
  size: number;
}

function backupAad(slot: string, savedAt: number, size: number): string {
  return `abs:backup:v1|${slot}|${savedAt}|${size}`;
}

export function isBackupEnvelope(value: unknown): value is BackupEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Partial<BackupEnvelope>;
  return (
    raw.v === BACKUP_ENVELOPE_VERSION &&
    raw.alg === 'AES-GCM' &&
    typeof raw.iv === 'string' &&
    typeof raw.ciphertext === 'string' &&
    typeof raw.savedAt === 'number' &&
    Number.isFinite(raw.savedAt) &&
    typeof raw.size === 'number' &&
    Number.isFinite(raw.size)
  );
}

export async function sealBackup(record: BackupRecord, key: CryptoKey, slot: string): Promise<BackupEnvelope> {
  const encrypted = await encryptBytes(key, encodeUtf8(JSON.stringify(record)), backupAad(slot, record.savedAt, record.size));
  return {
    v: BACKUP_ENVELOPE_VERSION,
    alg: 'AES-GCM',
    iv: bytesToBase64(encrypted.iv),
    ciphertext: bytesToBase64(encrypted.ciphertext),
    savedAt: record.savedAt,
    size: record.size,
  };
}

/** Returns null for a wrong key, a tampered envelope or a cross-slot copy. */
export async function openBackup(envelope: BackupEnvelope, key: CryptoKey, slot: string): Promise<BackupRecord | null> {
  try {
    const plaintext = await decryptBytes(
      key,
      base64ToBytes(envelope.iv),
      base64ToBytes(envelope.ciphertext),
      backupAad(slot, envelope.savedAt, envelope.size),
    );
    const parsed: unknown = JSON.parse(decodeUtf8(plaintext));
    if (!isBackupRecord(parsed)) return null;
    if (parsed.savedAt !== envelope.savedAt || parsed.size !== envelope.size) return null;
    return parsed;
  } catch {
    return null;
  }
}
