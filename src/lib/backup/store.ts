import { clear, createStore, del, delMany, entries, get, set, update } from 'idb-keyval';
import { normalizeRepoPath } from '@/lib/paths/paths';
import { vaultSession } from '@/lib/vault/session';
import { isBackupEnvelope, openBackup, sealBackup } from './envelope';
import { type BackupRecord, isBackupRecord, MAX_BACKUP_CHARS } from './model';

export const MAX_BACKUPS = 20;
export const MAX_TOTAL_BACKUP_CHARS = 4_000_000;

const store = createStore('abs-backups', 'backups');

/**
 * Write-through cache for the current tab. Re-entering a file right after
 * navigating away (or right after a save) may happen before IndexedDB settles;
 * the latest snapshot must still win in that window.
 */
const memory = new Map<string, BackupRecord>();

export type BackupWriteResult = 'saved' | 'too-large' | 'failed' | 'locked';

export function backupStorageKey(repoKey: string, path: string): string {
  return `${repoKey}\u0000${normalizeRepoPath(path)}`;
}

/**
 * Demo repositories have no vault (fixture-only content), so their backups stay
 * plaintext. Every other repository must be encrypted with the vault-derived
 * key: falling back to plaintext on a locked session would leak the draft.
 */
export function backupIsEncrypted(repoKey: string): boolean {
  return !repoKey.startsWith('demo:');
}

async function backupKey(repoKey: string): Promise<CryptoKey | null> {
  if (!backupIsEncrypted(repoKey)) return null;
  return vaultSession.getBackupKey();
}

function repoKeyFromSlot(slot: string): string {
  const separator = slot.indexOf('\u0000');
  return separator === -1 ? slot : slot.slice(0, separator);
}

async function readStoredEntries(): Promise<Array<[IDBValidKey, unknown]>> {
  const rows = await entries(store);
  return rows as Array<[IDBValidKey, unknown]>;
}

async function storedToRecord(idbKey: IDBValidKey, value: unknown): Promise<BackupRecord | null> {
  if (isBackupEnvelope(value)) {
    const slot = String(idbKey);
    const key = await backupKey(repoKeyFromSlot(slot));
    if (!key) return null;
    return openBackup(value, key, slot);
  }
  if (!isBackupRecord(value)) return null;
  if (backupIsEncrypted(value.repoKey) && !(await backupKey(value.repoKey))) return null;
  return value;
}

export async function readBackup(repoKey: string, path: string): Promise<BackupRecord | null> {
  const key = backupStorageKey(repoKey, path);
  const cached = memory.get(key);
  if (cached) return cached;
  try {
    const value = await get(key, store);
    const record = await storedToRecord(key, value);
    if (!record) return null;
    if (record.repoKey !== repoKey || normalizeRepoPath(record.path) !== normalizeRepoPath(path)) return null;
    memory.set(key, record);
    return record;
  } catch {
    return null;
  }
}

export async function writeBackup(record: BackupRecord): Promise<BackupWriteResult> {
  if (record.size > MAX_BACKUP_CHARS) return 'too-large';
  const key = backupStorageKey(record.repoKey, record.path);
  const encrypted = backupIsEncrypted(record.repoKey);
  const cryptoKey = await backupKey(record.repoKey);
  if (encrypted && !cryptoKey) return 'locked';
  memory.set(key, record);

  const write = async (): Promise<void> => {
    if (cryptoKey) {
      await set(key, await sealBackup(record, cryptoKey, key), store);
    } else {
      await set(key, record, store);
    }
  };

  try {
    await write();
  } catch {
    try {
      await pruneBackups();
      await write();
    } catch {
      return 'failed';
    }
  }

  try {
    await pruneBackups();
  } catch {
    // A failed prune must not turn a successful write into a failure.
  }
  return 'saved';
}

export async function removeBackup(repoKey: string, path: string): Promise<void> {
  const key = backupStorageKey(repoKey, path);
  memory.delete(key);
  try {
    await del(key, store);
  } catch {
    // Best effort; the in-memory delete already prevents a same-tab re-prompt.
  }
}

export async function listBackups(prefix = ''): Promise<BackupRecord[]> {
  const merged = new Map<string, BackupRecord>();
  try {
    for (const [key, value] of await readStoredEntries()) {
      const record = await storedToRecord(key, value);
      if (record) merged.set(String(key), record);
    }
  } catch {
    // IndexedDB unavailable: fall back to the records this tab wrote.
  }
  for (const [key, value] of memory) merged.set(key, value);
  return [...merged.values()].filter((record) => record.repoKey.startsWith(prefix)).sort((a, b) => b.savedAt - a.savedAt);
}

/** Clear every backup for a repo prefix (all branches). `''` clears everything. */
export async function clearBackupsByPrefix(prefix = ''): Promise<boolean> {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  try {
    const rows = await readStoredEntries();
    const keys: IDBValidKey[] = [];
    for (const [key, value] of rows) {
      if (String(key).startsWith(prefix) || (isBackupRecord(value) && value.repoKey.startsWith(prefix))) {
        keys.push(key);
      }
    }
    if (keys.length > 0) await delMany(keys, store);
    return true;
  } catch {
    return false;
  }
}

interface PruneRow {
  key: string;
  savedAt: number;
  size: number;
}

async function pruneBackups(): Promise<void> {
  const rows: PruneRow[] = [];
  for (const [key, value] of await readStoredEntries()) {
    if (isBackupRecord(value)) {
      rows.push({ key: String(key), savedAt: value.savedAt, size: value.size });
    } else if (isBackupEnvelope(value)) {
      rows.push({ key: String(key), savedAt: value.savedAt, size: value.size });
    }
  }
  rows.sort((a, b) => b.savedAt - a.savedAt);

  const doomed = new Set<string>();
  for (let index = MAX_BACKUPS; index < rows.length; index += 1) {
    const key = rows[index]?.key;
    if (key !== undefined) doomed.add(key);
  }

  let total = rows.reduce((sum, row) => sum + row.size, 0);
  for (let index = rows.length - 1; index >= 0 && total > MAX_TOTAL_BACKUP_CHARS; index -= 1) {
    const row = rows[index];
    if (!row || doomed.has(row.key)) continue;
    doomed.add(row.key);
    total -= row.size;
  }

  if (doomed.size === 0) return;
  for (const key of doomed) memory.delete(key);
  await delMany([...doomed], store);
}

/**
 * Upgrade plaintext backups written by older versions. Runs best-effort right
 * after the vault is unlocked; failures leave the plaintext copy for a later
 * attempt instead of blocking the session. Encrypted records with a different
 * key are left alone (the user can clear them from settings).
 */
export async function migrateBackups(): Promise<void> {
  const key = await vaultSession.getBackupKey();
  if (!key) return;
  let rows: Array<[IDBValidKey, unknown]>;
  try {
    rows = await readStoredEntries();
  } catch {
    return;
  }
  for (const [idbKey, value] of rows) {
    if (!isBackupRecord(value)) continue;
    if (!backupIsEncrypted(value.repoKey)) continue;
    const slot = backupStorageKey(value.repoKey, value.path);
    if (String(idbKey) !== slot) continue;
    try {
      const envelope = await sealBackup(value, key, slot);
      // `update` is one IndexedDB transaction: if an editor autosave already
      // replaced this row with a newer (encrypted) record, keep that record.
      await update<unknown>(
        slot,
        (current) => {
          if (current === undefined) throw new Error('backup vanished');
          return isBackupRecord(current) &&
            current.savedAt === value.savedAt &&
            current.baseSha === value.baseSha &&
            current.size === value.size
            ? envelope
            : current;
        },
        store,
      );
    } catch {
      // Leave the plaintext copy; the next unlock retries.
    }
  }
}

/** Drop decrypted drafts from memory when the vault locks. */
export function dropBackupMemory(): void {
  memory.clear();
}

/** Test/settings helper: clear the whole store, including records only in memory. */
export async function clearAllBackups(): Promise<boolean> {
  memory.clear();
  try {
    await clear(store);
    return true;
  } catch {
    return false;
  }
}
