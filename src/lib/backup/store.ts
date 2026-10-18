import { clear, createStore, del, delMany, entries, get, set } from 'idb-keyval';
import { normalizeRepoPath } from '@/lib/paths/paths';
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

export type BackupWriteResult = 'saved' | 'too-large' | 'failed';

export function backupStorageKey(repoKey: string, path: string): string {
  return `${repoKey}\u0000${normalizeRepoPath(path)}`;
}

async function readStoredEntries(): Promise<Array<[IDBValidKey, unknown]>> {
  const rows = await entries(store);
  return rows as Array<[IDBValidKey, unknown]>;
}

export async function readBackup(repoKey: string, path: string): Promise<BackupRecord | null> {
  const key = backupStorageKey(repoKey, path);
  const cached = memory.get(key);
  if (cached) return cached;
  try {
    const value = await get(key, store);
    if (!isBackupRecord(value)) return null;
    if (value.repoKey !== repoKey || normalizeRepoPath(value.path) !== normalizeRepoPath(path)) return null;
    memory.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export async function writeBackup(record: BackupRecord): Promise<BackupWriteResult> {
  if (record.size > MAX_BACKUP_CHARS) return 'too-large';
  const key = backupStorageKey(record.repoKey, record.path);
  memory.set(key, record);

  try {
    await set(key, record, store);
  } catch {
    try {
      await pruneBackups();
      await set(key, record, store);
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
      if (!isBackupRecord(value)) continue;
      merged.set(String(key), value);
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

async function pruneBackups(): Promise<void> {
  const rows: Array<[IDBValidKey, BackupRecord]> = [];
  for (const [key, value] of await readStoredEntries()) {
    if (isBackupRecord(value)) rows.push([key, value]);
  }
  rows.sort((a, b) => b[1].savedAt - a[1].savedAt);

  const doomed = new Set<string>();
  for (let index = MAX_BACKUPS; index < rows.length; index += 1) {
    const key = rows[index]?.[0];
    if (key !== undefined) doomed.add(String(key));
  }

  let total = rows.reduce((sum, [, record]) => sum + record.size, 0);
  for (let index = rows.length - 1; index >= 0 && total > MAX_TOTAL_BACKUP_CHARS; index -= 1) {
    const row = rows[index];
    if (!row) continue;
    const key = String(row[0]);
    if (doomed.has(key)) continue;
    doomed.add(key);
    total -= row[1].size;
  }

  if (doomed.size === 0) return;
  for (const key of doomed) memory.delete(key);
  await delMany([...doomed], store);
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
