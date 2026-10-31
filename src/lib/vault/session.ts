import { deriveBackupKey, deriveContentKey, deriveDraftKey } from './crypto';

interface SessionState {
  legacyToken: string | null;
  tokens: Map<string, string>;
  dataKey: Uint8Array;
  backupKey: Promise<CryptoKey | null> | null;
  contentKey: Promise<CryptoKey | null> | null;
  draftKey: Promise<CryptoKey | null> | null;
}

let state: SessionState | null = null;

/**
 * Unlocked secrets live in memory only: every repository PAT plus the vault
 * data key. All PATs share one credential (device fingerprint or password), so
 * switching repositories never asks for the unlock secret again. `clear()`
 * drops all of them on lock/reset.
 */
export const vaultSession = {
  /**
   * `token` is the legacy single PAT slot. Passing it keeps old unit tests and
   * migration paths readable; new vaults pass their first PAT in `tokens`.
   */
  set(token: string | null, dataKey: Uint8Array, tokens: Record<string, string> = {}): void {
    state = {
      legacyToken: token,
      tokens: new Map(Object.entries(tokens)),
      dataKey,
      backupKey: null,
      contentKey: null,
      draftKey: null,
    };
  },
  /**
   * Active-repository lookup. The legacy token is a migration fallback for the
   * repository that was configured before multi-repo support; it must never be
   * borrowed for a different repository. Inactive/add flows use
   * `getStoredTokenForRepo` instead.
   */
  getTokenForRepo(repoKey: string): string | null {
    const current = state;
    if (!current) return null;
    return current.tokens.get(repoKey) ?? current.legacyToken;
  },
  hasTokenForRepo(repoKey: string): boolean {
    return Boolean(this.getTokenForRepo(repoKey));
  },
  getStoredTokenForRepo(repoKey: string): string | null {
    return state?.tokens.get(repoKey) ?? null;
  },
  hasStoredTokenForRepo(repoKey: string): boolean {
    return Boolean(this.getStoredTokenForRepo(repoKey));
  },
  getLegacyToken(): string | null {
    return state?.legacyToken ?? null;
  },
  getRepoTokenEntries(): Record<string, string> {
    return Object.fromEntries(state?.tokens ?? []);
  },
  setRepoToken(repoKey: string, token: string): void {
    if (!state) return;
    state.tokens.set(repoKey, token);
  },
  removeRepoToken(repoKey: string): void {
    state?.tokens.delete(repoKey);
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
  getDraftKey(): Promise<CryptoKey | null> {
    const current = state;
    if (!current) return Promise.resolve(null);
    if (!current.draftKey) {
      current.draftKey = deriveDraftKey(current.dataKey).catch(() => null);
    }
    return current.draftKey;
  },
  has(): boolean {
    return state !== null;
  },
  clear(): void {
    state = null;
  },
};
