import { afterEach, describe, expect, it } from 'vitest';
import {
  clearVault,
  createVault,
  loadVault,
  unlockWithDevice,
  unlockWithPassword,
  VaultError,
  type VaultPayload,
} from '@/lib/vault/keystore';

const token = 'github_pat_test_token_value';

describe('vault encryption', () => {
  afterEach(() => {
    clearVault();
  });

  it('encrypts and unlocks with a password', async () => {
    await createVault({ token, password: 'correct horse battery staple', useDevice: false, iterations: 1000 });
    const payload = loadVault();
    expect(payload).toBeTruthy();
    expect(payload?.password).toBeTruthy();
    expect(payload?.device).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain(token);

    await expect(unlockWithPassword(payload as VaultPayload, 'correct horse battery staple')).resolves.toBe(token);
    await expect(unlockWithPassword(payload as VaultPayload, 'wrong password')).rejects.toBeInstanceOf(VaultError);
  });

  it('rejects tampered ciphertext', async () => {
    await createVault({ token, password: 'password123', useDevice: false, iterations: 1000 });
    const payload = loadVault() as VaultPayload;
    const tampered: VaultPayload = {
      ...payload,
      token: { ...payload.token, ciphertext: `${payload.token.ciphertext.slice(0, -4)}AAAA` },
    };
    await expect(unlockWithPassword(tampered, 'password123')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });

  it('binds the vault to the device fingerprint as a second method', async () => {
    await createVault({ token, useDevice: true, iterations: 1000 });
    const payload = loadVault() as VaultPayload;
    expect(payload.device?.source).toMatch(/fpjs|local/);
    await expect(unlockWithDevice(payload)).resolves.toBe(token);
  });

  it('does not create a vault without any unlock method', async () => {
    await expect(createVault({ token, useDevice: false, iterations: 1000 })).rejects.toBeInstanceOf(VaultError);
  });
});
