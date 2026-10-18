import { create } from 'zustand';
import {
  clearVault,
  createVault,
  loadVault,
  unlockWithDevice,
  unlockWithPassword,
  type VaultPayload,
} from '@/lib/vault/keystore';
import { vaultSession } from '@/lib/vault/session';

export type VaultStatus = 'empty' | 'locked' | 'unlocked';

interface VaultState {
  status: VaultStatus;
  hasDevice: boolean;
  hasPassword: boolean;
  busy: boolean;
  error: string | null;
  initialize: () => void;
  setup: (input: { token: string; password?: string; useDevice: boolean; requireDevice?: boolean }) => Promise<void>;
  unlockPassword: (password: string) => Promise<void>;
  unlockDevice: () => Promise<void>;
  lock: () => void;
  reset: () => void;
  clearError: () => void;
}

function flags(payload: VaultPayload | null): Pick<VaultState, 'hasDevice' | 'hasPassword'> {
  return { hasDevice: Boolean(payload?.device), hasPassword: Boolean(payload?.password) };
}

export const useVault = create<VaultState>()((set) => ({
  status: 'empty',
  hasDevice: false,
  hasPassword: false,
  busy: false,
  error: null,

  initialize: () => {
    const payload = loadVault();
    set({
      status: payload ? 'locked' : 'empty',
      ...flags(payload),
      busy: false,
      error: null,
    });
  },

  setup: async (input) => {
    set({ busy: true, error: null });
    try {
      const payload = await createVault(input);
      vaultSession.set(input.token);
      set({ status: 'unlocked', busy: false, ...flags(payload) });
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  unlockPassword: async (password) => {
    const payload = loadVault();
    if (!payload) {
      set({ status: 'empty', error: '没有找到保险库，请重新配置。' });
      return;
    }
    set({ busy: true, error: null });
    try {
      const token = await unlockWithPassword(payload, password);
      vaultSession.set(token);
      set({ status: 'unlocked', busy: false, ...flags(payload) });
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  unlockDevice: async () => {
    const payload = loadVault();
    if (!payload) {
      set({ status: 'empty', error: '没有找到保险库，请重新配置。' });
      return;
    }
    set({ busy: true, error: null });
    try {
      const token = await unlockWithDevice(payload);
      vaultSession.set(token);
      set({ status: 'unlocked', busy: false, ...flags(payload) });
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  lock: () => {
    vaultSession.clear();
    const payload = loadVault();
    set({ status: payload ? 'locked' : 'empty', ...flags(payload), error: null });
  },

  reset: () => {
    clearVault();
    vaultSession.clear();
    set({ status: 'empty', hasDevice: false, hasPassword: false, error: null });
  },

  clearError: () => set({ error: null }),
}));
