import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64, encodeUtf8 } from '@/lib/utils/encoding';
import type { VaultPayload } from '@/lib/vault/keystore';

const token = 'github_pat_test_token_value';
const password = 'correct horse battery staple';
const newPassword = 'another correct horse battery';

const deviceA = {
  userAgent: 'abs-test/Device-A',
  platform: 'test-platform',
  language: 'en-US',
  hardwareConcurrency: 8,
};

const fpjsState = vi.hoisted(() => ({ mode: 'throw' as 'throw' | 'resolve' }));

vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: {
    load: async () => {
      if (fpjsState.mode === 'throw') throw new Error('fingerprint unavailable');
      return { get: async () => ({ visitorId: 'fpjs-visitor-id' }) };
    },
  },
}));

/** Fresh module instance = fresh fingerprint cache, so device changes are observable. */
async function freshVault() {
  vi.resetModules();
  return import('@/lib/vault/keystore');
}

beforeEach(() => {
  vi.stubGlobal('navigator', { ...deviceA });
  vi.stubGlobal('screen', { width: 1280, height: 800, colorDepth: 24 });
  fpjsState.mode = 'throw';
});

afterEach(async () => {
  const { clearVault } = await freshVault();
  clearVault();
  vi.unstubAllGlobals();
});

describe('vault unlock modes', () => {
  it('unlocks password mode with the password only and never exposes a device wrap', async () => {
    const vault = await freshVault();
    const { payload } = await vault.createVault({ token, mode: 'password', password, iterations: 1000 });

    expect(payload.device).toBeUndefined();
    expect(payload.password?.requireDevice).toBe(false);
    expect(JSON.stringify(payload)).not.toContain(token);
    expect(vault.vaultModeOf(payload)).toBe('password');

    const secrets = await vault.unlockWithPassword(payload, password);
    expect(secrets.token).toBe(token);
    expect(secrets.dataKey).toHaveLength(32);

    await expect(vault.unlockWithPassword(payload, 'wrong password')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    });
    await expect(vault.unlockWithDevice(payload)).rejects.toMatchObject({ code: 'NO_METHOD' });
  });

  it('unlocks device mode with the fingerprint only', async () => {
    const vault = await freshVault();
    const { payload } = await vault.createVault({ token, mode: 'device', iterations: 1000 });

    expect(payload.password).toBeUndefined();
    expect(payload.device?.source).toMatch(/fpjs|local/);
    expect(vault.vaultModeOf(payload)).toBe('device');

    const secrets = await vault.unlockWithDevice(payload);
    expect(secrets.token).toBe(token);
    await expect(vault.unlockWithPassword(payload, password)).rejects.toMatchObject({ code: 'NO_METHOD' });
  });

  it('two-factor stores no device wrap and needs the password AND the same device', async () => {
    const vault = await freshVault();
    const { payload } = await vault.createVault({ token, mode: 'two-factor', password, iterations: 1000 });

    // This is the security property: a device-only credential simply does not exist.
    expect(payload.device).toBeUndefined();
    expect(payload.password?.requireDevice).toBe(true);
    expect(vault.vaultModeOf(payload)).toBe('two-factor');

    const secrets = await vault.unlockWithPassword(payload, password);
    expect(secrets.token).toBe(token);
    await expect(vault.unlockWithDevice(payload)).rejects.toMatchObject({ code: 'NO_METHOD' });

    // Same password, different device fingerprint: both factors no longer match.
    vi.stubGlobal('navigator', { ...deviceA, userAgent: 'abs-test/Device-B' });
    const otherDevice = await freshVault();
    await expect(
      otherDevice.unlockWithPassword(JSON.parse(JSON.stringify(payload)) as VaultPayload, password),
    ).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });

  it('keeps legacy mixed vaults unlockable and reports them as legacy', async () => {
    const crypto = await (async () => {
      vi.resetModules();
      return import('@/lib/vault/crypto');
    })();
    const fingerprint = await import('@/lib/vault/fingerprint');
    const vault = await freshVault();

    const deviceId = await fingerprint.getDeviceId();
    const dataKey = crypto.randomBytes(32);
    const tokenKey = await crypto.importAesKey(dataKey);
    const tokenEncrypted = await crypto.encryptBytes(tokenKey, encodeUtf8(token), crypto.AAD_TOKEN);

    const deviceSalt = crypto.randomBytes(16);
    const deviceKek = await crypto.deriveKek(crypto.passphraseForDevice(deviceId.id), deviceSalt, 1000);
    const deviceWrapped = await crypto.encryptBytes(deviceKek, dataKey, crypto.AAD_KEY_DEVICE);
    const passwordSalt = crypto.randomBytes(16);
    const passwordKek = await crypto.deriveKek(crypto.passphraseForPassword(password), passwordSalt, 1000);
    const passwordWrapped = await crypto.encryptBytes(passwordKek, dataKey, crypto.AAD_KEY_PASSWORD);

    const payload: VaultPayload = {
      v: 1,
      kdf: { name: 'PBKDF2-SHA256', iterations: 1000 },
      device: {
        salt: bytesToBase64(deviceSalt),
        iv: bytesToBase64(deviceWrapped.iv),
        wrappedKey: bytesToBase64(deviceWrapped.ciphertext),
        source: deviceId.source,
      },
      password: {
        salt: bytesToBase64(passwordSalt),
        iv: bytesToBase64(passwordWrapped.iv),
        wrappedKey: bytesToBase64(passwordWrapped.ciphertext),
        requireDevice: false,
      },
      token: { iv: bytesToBase64(tokenEncrypted.iv), ciphertext: bytesToBase64(tokenEncrypted.ciphertext) },
      createdAt: new Date().toISOString(),
    };
    vault.saveVault(payload);

    expect(vault.vaultModeOf(payload)).toBe('legacy-mixed');
    await expect(vault.unlockWithPassword(payload, password)).resolves.toMatchObject({ token });
    await expect(vault.unlockWithDevice(payload)).resolves.toMatchObject({ token });
  });

  it('rejects missing or too-short passwords before writing anything', async () => {
    const vault = await freshVault();
    await expect(vault.createVault({ token, mode: 'password', password: 'short', iterations: 1000 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(vault.createVault({ token, mode: 'two-factor', iterations: 1000 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(vault.loadVault()).toBeNull();
  });

  it('treats a tampered token ciphertext as a wrong password', async () => {
    const vault = await freshVault();
    const { payload } = await vault.createVault({ token, mode: 'password', password, iterations: 1000 });
    const tampered: VaultPayload = {
      ...payload,
      token: { ...payload.token, ciphertext: `${payload.token.ciphertext.slice(0, -4)}AAAA` },
    };
    await expect(vault.unlockWithPassword(tampered, password)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });
});

describe('vault rewrap', () => {
  it('reuses the data key so encrypted backups stay readable', async () => {
    const vault = await freshVault();
    const created = await vault.createVault({ token, mode: 'password', password, iterations: 1000 });
    const rewrapped = await vault.rewrapVault({
      token,
      dataKey: created.dataKey,
      mode: 'two-factor',
      password: newPassword,
      iterations: 1000,
    });

    expect(vault.vaultModeOf(rewrapped)).toBe('two-factor');
    expect(rewrapped.device).toBeUndefined();
    expect(rewrapped.token.ciphertext).not.toBe(created.payload.token.ciphertext);

    const secrets = await vault.unlockWithPassword(rewrapped, newPassword);
    expect(secrets.token).toBe(token);
    expect([...secrets.dataKey]).toEqual([...created.dataKey]);
    await expect(vault.unlockWithPassword(rewrapped, password)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });

  it('can drop the password and fall back to device-only', async () => {
    const vault = await freshVault();
    const created = await vault.createVault({ token, mode: 'two-factor', password, iterations: 1000 });
    const deviceOnly = await vault.rewrapVault({ token, dataKey: created.dataKey, mode: 'device', iterations: 1000 });

    expect(deviceOnly.password).toBeUndefined();
    expect(deviceOnly.device).toBeDefined();
    expect(vault.vaultModeOf(deviceOnly)).toBe('device');
    await expect(vault.unlockWithDevice(deviceOnly)).resolves.toMatchObject({ token });
  });
});
