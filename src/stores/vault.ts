import { create } from 'zustand';
import { flushActiveBackup } from '@/lib/backup/flush';
import { clearBackupsByPrefix, dropBackupMemory, migrateBackups } from '@/lib/backup/store';
import { clearContentByPrefix, dropContentMemory } from '@/lib/content/storage';
import {
  clearVault,
  createVault,
  loadVault,
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

export type VaultStatus = 'empty' | 'locked' | 'unlocked';

interface VaultState {
  status: VaultStatus;
  mode: VaultModeState | null;
  busy: boolean;
  error: string | null;
  initialize: () => void;
  setup: (input: { token: string; mode: VaultMode; password?: string }) => Promise<void>;
  unlockPassword: (password: string) => Promise<void>;
  unlockDevice: () => Promise<void>;
  changeUnlock: (input: { mode: VaultMode; password?: string }) => Promise<void>;
  lock: () => Promise<void>;
  reset: () => Promise<void>;
  clearError: () => void;
}

function modeOf(payload: VaultPayload | null): VaultModeState | null {
  return vaultModeOf(payload);
}

function unlockedSecrets(secrets: VaultSecrets): void {
  vaultSession.set(secrets.token, secrets.dataKey);
}

export const useVault = create<VaultState>()((set) => ({
  status: 'empty',
  mode: null,
  busy: false,
  error: null,

  initialize: () => {
    const payload = loadVault();
    set({
      status: payload ? 'locked' : 'empty',
      mode: modeOf(payload),
      busy: false,
      error: null,
    });
  },

  setup: async (input) => {
    set({ busy: true, error: null });
    try {
      const created = await createVault(input);
      unlockedSecrets({ token: input.token, dataKey: created.dataKey });
      set({ status: 'unlocked', busy: false, mode: modeOf(created.payload) });
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
      unlockedSecrets(await unlockWithPassword(payload, password));
      set({ status: 'unlocked', busy: false, mode: modeOf(payload) });
      void migrateBackups();
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  unlockDevice: async () => {
    const payload = loadVault();
    if (!payload) {
      set({ status: 'empty', mode: null, error: '没有找到保险库，请重新配置。' });
      return;
    }
    set({ busy: true, error: null });
    try {
      unlockedSecrets(await unlockWithDevice(payload));
      set({ status: 'unlocked', busy: false, mode: modeOf(payload) });
      void migrateBackups();
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  changeUnlock: async (input) => {
    const token = vaultSession.get();
    const dataKey = vaultSession.getDataKey();
    if (!token || !dataKey) throw new Error('会话已锁定，请重新解锁后再修改解锁方式');
    set({ busy: true, error: null });
    try {
      const payload = await rewrapVault({ token, dataKey, mode: input.mode, password: input.password });
      // The data key is reused, so decrypted backup keys stay valid.
      set({ busy: false, mode: modeOf(payload) });
    } catch (error) {
      set({ busy: false });
      throw error;
    }
  },

  lock: async () => {
    await flushActiveBackup();
    dropBackupMemory();
    dropContentMemory();
    useContent.getState().reset();
    vaultSession.clear();
    const payload = loadVault();
    set({ status: payload ? 'locked' : 'empty', mode: modeOf(payload), error: null });
  },

  reset: async () => {
    clearVault();
    vaultSession.clear();
    dropBackupMemory();
    dropContentMemory();
    useContent.getState().reset();
    await clearBackupsByPrefix('live:');
    await clearContentByPrefix('live:');
    set({ status: 'empty', mode: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
