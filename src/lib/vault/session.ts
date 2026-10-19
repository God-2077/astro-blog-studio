import { deriveBackupKey, deriveContentKey } from './crypto';

interface SessionState {
  token: string;
  dataKey: Uint8Array;
  backupKey: Promise<CryptoKey | null> | null;
  contentKey: Promise<CryptoKey | null> | null;
}

let state: SessionState | null = null;

/**
 * Unlocked secrets live in memory only: the PAT plus the vault data key.
 * The data key is needed to re-wrap the credentials when the unlock mode or
 * password changes, and to derive the backup encryption key. `clear()` drops
 * all of it on lock/reset.
 */
export const vaultSession = {
  set(token: string, dataKey: Uint8Array): void {
    state = { token, dataKey, backupKey: null, contentKey: null };
  },
  get(): string | null {
    return state?.token ?? null;
  },
  getDataKey(): Uint8Array | null {
    return state?.dataKey ?? null;
  },
  getBackupKey(): Promise<CryptoKey | null> {
    const current = state;
    if (!current) return Promise.resolve(null);
    if (!current.backupKey) {
      current.backupKey = deriveBackupKey(current.dataKey).catch(() => null);
    }
    return current.backupKey;
  },
  getContentKey(): Promise<CryptoKey | null> {
    const current = state;
    if (!current) return Promise.resolve(null);
    if (!current.contentKey) {
      current.contentKey = deriveContentKey(current.dataKey).catch(() => null);
    }
    return current.contentKey;
  },
  has(): boolean {
    return state !== null;
  },
  clear(): void {
    state = null;
  },
};
