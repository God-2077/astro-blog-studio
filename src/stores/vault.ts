import { create } from 'zustand';
import { flushActiveBackup } from '@/lib/backup/flush';
import { clearBackupsByPrefix, dropBackupMemory, migrateBackups } from '@/lib/backup/store';
import { clearContentByPrefix, dropContentMemory } from '@/lib/content/storage';
import { clearDraftsByPrefix, dropDraftMemory } from '@/lib/drafts/store';
import { repoTokenKey } from '@/lib/repos/identity';
import {
  addRepoTokenToVault,
  clearVault,
  createVault,
  loadVault,
  migrateLegacyTokenToRepo,
  removeRepoTokenFromVault,
  rewrapVault,
  unlockWithDevice,
  unlockWithPassword,
  type VaultPayload,
  type VaultSecrets,
  vaultModeOf,
} from '@/lib/vault/keystore';
import type { VaultMode, VaultModeState } from '@/lib/vault/mode';
import { vaultSession } from '@/lib/vault/session';
import { useContent } from '@/stores/content';
import { useDrafts } from '@/stores/drafts';
import { useLastCommit } from '@/stores/last-commit';
import { usePendingPost } from '@/stores/pending-post';
import { useRateLimit } from '@/stores/rate-limit';
import { useSettings } from '@/stores/settings';

export type VaultStatus = 'empty' | 'locked' | 'unlocked';

interface VaultState {
  status: VaultStatus;
  mode: VaultModeState | null;
  busy: boolean;
  error: string | null;
  /** Bumped whenever the in-memory PAT map changes, so the gateway rebuilds. */
  tokenRevision: number;
  initialize: () => void;
  setup: (input: { repoKey: string; token: string; mode: VaultMode; password?: string }) => Promise<void>;
  unlockPassword: (password: string) => Promise<void>;
  unlockDevice: () => Promise<void>;
  changeUnlock: (input: { mode: VaultMode; password?: string }) => Promise<void>;
  addRepoToken: (repoKey: string, token: string) => Promise<void>;
  removeRepoToken: (repoKey: string) => Promise<void>;
  lock: () => Promise<void>;
  reset: () => Promise<void>;
  clearError: () => void;
}

function modeOf(payload: VaultPayload | null): VaultModeState | null {
  return vaultModeOf(payload);
}

function unlockedSecrets(secrets: VaultSecrets): void {
  vaultSession.set(secrets.token, secrets.dataKey, secrets.tokens);
}

/**
 * Older vaults stored one PAT without a repository association. When the user
 * unlocks with an active repository configured, the token belongs to it.
 * Best-effort: a failed localStorage write leaves the legacy token usable.
 */
async function adoptLegacyToken(secrets: VaultSecrets): Promise<void> {
  const legacyToken = secrets.token;
  if (!legacyToken) return;
  const repo = useSettings.getState().repo;
  if (!repo) return;
  const key = repoTokenKey(repo);
  // Bind the legacy PAT to the configured repository even if the best-effort
  // localStorage rewrite fails. This keeps switching between repositories
  // working for the rest of the session and retries the disk migration on the
  // next unlock.
  if (!secrets.tokens[key]) secrets.tokens[key] = legacyToken;
  secrets.token = null;
  // Reload after unlock: fingerprint migration may already have written a new
  // device/password wrap, and writing the pre-unlock payload here would undo it.
  const latest = loadVault();
  if (!latest) return;
  try {
    await migrateLegacyTokenToRepo(latest, secrets.dataKey, legacyToken, key);
  } catch {
    // The in-memory binding above is enough for this session.
  }
}

export const useVault = create<VaultState>()((set, get) => ({
  status: 'empty',
  mode: null,
  busy: false,
  error: null,
  tokenRevision: 0,

  initialize: () => {
    const payload = loadVault();
    set({
      status: payload ? 'locked' : 'empty',
      mode: modeOf(payload),
      busy: false,
      error: null,
      tokenRevision: 0,
    });
  },

  setup: async (input) => {
    set({ busy: true, error: null });
    try {
      const created = await createVault(input);
      unlockedSecrets({ token: null, tokens: { [input.repoKey]: input.token }, dataKey: created.dataKey });
      set((state) => ({
        status: 'unlocked',
        busy: false,
        mode: modeOf(created.payload),
        tokenRevision: state.tokenRevision + 1,
      }));
      void migrateBackups();
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  unlockPassword: async (password) => {
    const payload = loadVault();
    if (!payload) {
      set({ status: 'empty', mode: null, error: '没有找到保险库，请重新配置。' });
      return;
    }
    set({ busy: true, error: null });
    try {
      const secrets = await unlockWithPassword(payload, password);
      await adoptLegacyToken(secrets);
      unlockedSecrets(secrets);
      set((state) => ({
        status: 'unlocked',
        busy: false,
        mode: modeOf(payload),
        tokenRevision: state.tokenRevision + 1,
      }));
      void migrateBackups();
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  unlockDevice: async () => {
    if (get().busy) return;
    const payload = loadVault();
    if (!payload) {
      set({ status: 'empty', mode: null, error: '没有找到保险库，请重新配置。' });
      return;
    }
    set({ busy: true, error: null });
    try {
      const secrets = await unlockWithDevice(payload);
      await adoptLegacyToken(secrets);
      unlockedSecrets(secrets);
      set((state) => ({
        status: 'unlocked',
        busy: false,
        mode: modeOf(payload),
        tokenRevision: state.tokenRevision + 1,
      }));
      void migrateBackups();
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  changeUnlock: async (input) => {
    const dataKey = vaultSession.getDataKey();
    const tokens = vaultSession.getRepoTokenEntries();
    const legacyToken = vaultSession.getLegacyToken();
    if (!dataKey || (Object.keys(tokens).length === 0 && !legacyToken)) {
      throw new Error('会话已锁定，请重新解锁后再修改解锁方式');
    }
    set({ busy: true, error: null });
    try {
      const payload = await rewrapVault({
        tokens,
        legacyToken,
        dataKey,
        mode: input.mode,
        password: input.password,
      });
      set({ busy: false, mode: modeOf(payload) });
    } catch (error) {
      set({ busy: false });
      throw error;
    }
  },

  addRepoToken: async (repoKey, token) => {
    const payload = loadVault();
    const dataKey = vaultSession.getDataKey();
    if (!payload || !dataKey) {
      throw new Error('保险库已锁定，请重新解锁后再更新令牌');
    }
    await addRepoTokenToVault(payload, dataKey, repoKey, token);
    vaultSession.setRepoToken(repoKey, token.trim());
    set((state) => ({ tokenRevision: state.tokenRevision + 1 }));
  },

  removeRepoToken: async (repoKey) => {
    const payload = loadVault();
    if (!payload) throw new Error('没有找到保险库');
    removeRepoTokenFromVault(payload, repoKey);
    vaultSession.removeRepoToken(repoKey);
    set((state) => ({ tokenRevision: state.tokenRevision + 1 }));
  },

  lock: async () => {
    await flushActiveBackup();
    dropBackupMemory();
    dropContentMemory();
    dropDraftMemory();
    useContent.getState().reset();
    useDrafts.getState().reset();
    vaultSession.clear();
    const payload = loadVault();
    set({ status: payload ? 'locked' : 'empty', mode: modeOf(payload), error: null });
  },

  reset: async () => {
    clearVault();
    vaultSession.clear();
    dropBackupMemory();
    dropContentMemory();
    dropDraftMemory();
    useContent.getState().reset();
    useDrafts.getState().reset();
    useLastCommit.getState().clear();
    useRateLimit.getState().reset();
    usePendingPost.getState().clearDraft();
    useSettings.getState().clearRepos();
    await clearBackupsByPrefix('live:');
    await clearContentByPrefix('live:');
    await clearDraftsByPrefix('live:');
    set({ status: 'empty', mode: null, error: null, tokenRevision: 0 });
  },

  clearError: () => set({ error: null }),
}));
