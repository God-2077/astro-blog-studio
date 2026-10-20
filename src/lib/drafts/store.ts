import { clear, createStore, del, delMany, entries, get, set } from 'idb-keyval';
import { normalizeRepoPath } from '@/lib/paths/paths';
import { vaultSession } from '@/lib/vault/session';
import { isDraftEnvelope, openDraft, sealDraft } from './envelope';
import { type DraftRecord, isDraftRecord, MAX_DRAFT_CHARS } from './model';

const store = createStore('abs-drafts', 'drafts');

/**
 * Write-through cache for the current tab: saving a draft and immediately
 * opening the draft box can happen before IndexedDB settles, and the explicit
 * save must win in that window.
 */
const memory = new Map<string, DraftRecord>();

export type DraftWriteResult = 'saved' | 'too-large' | 'failed' | 'locked';

export function draftStorageKey(repoKey: string, path: string): string {
  return `${repoKey}\u0000${normalizeRepoPath(path)}`;
}

/**
 * Demo repositories have no vault, so their drafts stay plaintext (same rule
 * as autosave backups). Live repositories must never fall back to plaintext.
 */
export function draftIsEncrypted(repoKey: string): boolean {
  return !repoKey.startsWith('demo:');
}

async function draftKey(repoKey: string): Promise<CryptoKey | null> {
  if (!draftIsEncrypted(repoKey)) return null;
  return vaultSession.getDraftKey();
}

function repoKeyFromSlot(slot: string): string {
  const separator = slot.indexOf('\u0000');
  return separator === -1 ? slot : slot.slice(0, separator);
}

async function readStoredEntries(): Promise<Array<[IDBValidKey, unknown]>> {
  const rows = await entries(store);
  return rows as Array<[IDBValidKey, unknown]>;
}

async function storedToRecord(idbKey: IDBValidKey, value: unknown): Promise<DraftRecord | null> {
  if (isDraftEnvelope(value)) {
    const slot = String(idbKey);
    const key = await draftKey(repoKeyFromSlot(slot));
    if (!key) return null;
    return openDraft(value, key, slot);
  }
  if (!isDraftRecord(value)) return null;
  if (draftIsEncrypted(value.repoKey) && !(await draftKey(value.repoKey))) return null;
  return value;
}

export async function readDraft(repoKey: string, path: string): Promise<DraftRecord | null> {
  const key = draftStorageKey(repoKey, path);
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

export async function writeDraft(record: DraftRecord): Promise<DraftWriteResult> {
  if (record.size > MAX_DRAFT_CHARS) return 'too-large';
  const key = draftStorageKey(record.repoKey, record.path);
  const encrypted = draftIsEncrypted(record.repoKey);
  const cryptoKey = await draftKey(record.repoKey);
  if (encrypted && !cryptoKey) return 'locked';
  memory.set(key, record);

  try {
    if (cryptoKey) {
      await set(key, await sealDraft(record, cryptoKey, key), store);
    } else {
      await set(key, record, store);
    }
    return 'saved';
  } catch {
    // Quota or a closed database: keep the in-memory copy so this tab still
    // sees the draft, but tell the caller it did not reach disk.
    return 'failed';
  }
}

export async function removeDraft(repoKey: string, path: string): Promise<void> {
  const key = draftStorageKey(repoKey, path);
  memory.delete(key);
  try {
    await del(key, store);
  } catch {
    // Best effort; the in-memory delete already hides it for this tab.
  }
}

export async function listDrafts(prefix = ''): Promise<DraftRecord[]> {
  const merged = new Map<string, DraftRecord>();
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

/** Clear every draft for a repo prefix (all branches). `''` clears everything. */
export async function clearDraftsByPrefix(prefix = ''): Promise<boolean> {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  try {
    const rows = await readStoredEntries();
    const keys: IDBValidKey[] = [];
    for (const [key, value] of rows) {
      if (String(key).startsWith(prefix) || (isDraftRecord(value) && value.repoKey.startsWith(prefix))) {
        keys.push(key);
      }
    }
    if (keys.length > 0) await delMany(keys, store);
    return true;
  } catch {
    return false;
  }
}

/** Drop decrypted drafts from memory when the vault locks. */
export function dropDraftMemory(): void {
  memory.clear();
}

/** Test/settings helper: clear the store, including records only in memory. */
export async function clearAllDrafts(): Promise<boolean> {
  memory.clear();
  try {
    await clear(store);
    return true;
  } catch {
    return false;
  }
}
