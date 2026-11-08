import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64, encodeUtf8 } from '@/lib/utils/encoding';
import type { VaultPayload } from '@/lib/vault/keystore';
import { vaultSession } from '@/lib/vault/session';

const token = 'github_pat_test_token_value';
const tokenB = 'github_pat_second_repository_value';
const repoKey = 'god-2077/astro-blog-content-test';
const repoKeyB = 'god-2077/astro-blog-content-notes';
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
  const vault = await import('@/lib/vault/keystore');
  // 模块重置会连带重置 i18n 的当前语言；这里恢复成测试默认的简体中文。
  const { setCurrentLocale } = await import('@/lib/i18n/locale-state');
  setCurrentLocale('zh-CN');
  return vault;
}

beforeEach(() => {
  vi.stubGlobal('navigator', { ...deviceA });
  vi.stubGlobal('screen', { width: 1280, height: 800, colorDepth: 24 });
  fpjsState.mode = 'throw';
});

afterEach(async () => {
  const { clearVault } = await freshVault();
  clearVault();
  vaultSession.clear();
  vi.unstubAllGlobals();
});

describe('vault unlock modes', () => {
  it('stores the first PAT under a repository key and never exposes plaintext', async () => {
    const vault = await freshVault();
    const { payload } = await vault.createVault({ repoKey, token, mode: 'password', password, iterations: 1000 });

    expect(payload.device).toBeUndefined();
    expect(payload.password?.requireDevice).toBe(false);
    expect(payload.token).toBeUndefined();
    expect(payload.tokens?.[repoKey]).toBeDefined();
    expect(JSON.stringify(payload)).not.toContain(token);
    expect(vault.vaultModeOf(payload)).toBe('password');

    const secrets = await vault.unlockWithPassword(payload, password);
    expect(secrets.token).toBeNull();
    expect(secrets.tokens[repoKey]).toBe(token);
    expect(secrets.dataKey).toHaveLength(32);

    await expect(vault.unlockWithPassword(payload, 'wrong password')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    });
    await expect(vault.unlockWithDevice(payload)).rejects.toMatchObject({ code: 'NO_METHOD' });
  });

  it('unlocks device mode with the fingerprint only', async () => {
    const vault = await freshVault();
    const { payload } = await vault.createVault({ repoKey, token, mode: 'device', iterations: 1000 });

    expect(payload.password).toBeUndefined();
    expect(payload.device?.source).toMatch(/fpjs|local/);
    expect(vault.vaultModeOf(payload)).toBe('device');

    const secrets = await vault.unlockWithDevice(payload);
    expect(secrets.tokens[repoKey]).toBe(token);
    expect(secrets.token).toBeNull();
    await expect(vault.unlockWithPassword(payload, password)).rejects.toMatchObject({ code: 'NO_METHOD' });
  });

  it('two-factor stores no device wrap and needs the password AND the same device', async () => {
    const vault = await freshVault();
    const { payload } = await vault.createVault({ repoKey, token, mode: 'two-factor', password, iterations: 1000 });

    // This is the security property: a device-only credential simply does not exist.
    expect(payload.device).toBeUndefined();
    expect(payload.password?.requireDevice).toBe(true);
    expect(vault.vaultModeOf(payload)).toBe('two-factor');

    const secrets = await vault.unlockWithPassword(payload, password);
    expect(secrets.tokens[repoKey]).toBe(token);
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
    await expect(
      vault.createVault({ repoKey, token, mode: 'password', password: 'short', iterations: 1000 }),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(vault.createVault({ repoKey, token, mode: 'two-factor', iterations: 1000 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(vault.loadVault()).toBeNull();
  });

  it('treats a tampered repository token as a corrupt vault', async () => {
    const vault = await freshVault();
    const { payload } = await vault.createVault({ repoKey, token, mode: 'password', password, iterations: 1000 });
    const envelope = payload.tokens?.[repoKey];
    expect(envelope).toBeDefined();
    if (!envelope) return;
    const tampered: VaultPayload = {
      ...payload,
      tokens: {
        ...payload.tokens,
        [repoKey]: { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA` },
      },
    };
    await expect(vault.unlockWithPassword(tampered, password)).rejects.toMatchObject({ code: 'CORRUPT' });
  });
});

describe('multiple repository tokens', () => {
  it('adds a second PAT, unlocks both and binds each ciphertext to its repository', async () => {
    const vault = await freshVault();
    const created = await vault.createVault({ repoKey, token, mode: 'password', password, iterations: 1000 });
    const payload = await vault.addRepoTokenToVault(created.payload, created.dataKey, repoKeyB, tokenB);

    expect(Object.keys(payload.tokens ?? {}).sort()).toEqual([repoKey, repoKeyB].sort());
    const secrets = await vault.unlockWithPassword(payload, password);
    expect(secrets.tokens).toEqual({ [repoKey]: token, [repoKeyB]: tokenB });

    const first = payload.tokens?.[repoKey];
    const second = payload.tokens?.[repoKeyB];
    expect(first && second).toBeTruthy();
    if (!first || !second) return;
    const swapped: VaultPayload = {
      ...payload,
      tokens: { [repoKey]: second, [repoKeyB]: first },
    };
    await expect(vault.unlockWithPassword(swapped, password)).rejects.toMatchObject({ code: 'CORRUPT' });
  });

  it('rewraps every repository token without changing the data key', async () => {
    const vault = await freshVault();
    const created = await vault.createVault({ repoKey, token, mode: 'password', password, iterations: 1000 });
    const withSecond = await vault.addRepoTokenToVault(created.payload, created.dataKey, repoKeyB, tokenB);

    const rewrapped = await vault.rewrapVault({
      tokens: { [repoKey]: token, [repoKeyB]: tokenB },
      dataKey: created.dataKey,
      mode: 'two-factor',
      password: newPassword,
      iterations: 1000,
    });

    expect(vault.vaultModeOf(rewrapped)).toBe('two-factor');
    expect(rewrapped.device).toBeUndefined();
    expect(rewrapped.token).toBeUndefined();
    expect(rewrapped.tokens?.[repoKey]?.ciphertext).not.toBe(withSecond.tokens?.[repoKey]?.ciphertext);
    expect(rewrapped.tokens?.[repoKeyB]?.ciphertext).toBeDefined();

    const secrets = await vault.unlockWithPassword(rewrapped, newPassword);
    expect(secrets.tokens).toEqual({ [repoKey]: token, [repoKeyB]: tokenB });
    expect([...secrets.dataKey]).toEqual([...created.dataKey]);
    await expect(vault.unlockWithPassword(rewrapped, password)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });

  it('can preserve a legacy token through a rewrap when no active repo is known', async () => {
    const vault = await freshVault();
    const created = await vault.createVault({ repoKey, token, mode: 'password', password, iterations: 1000 });
    const rewrapped = await vault.rewrapVault({
      tokens: {},
      legacyToken: token,
      dataKey: created.dataKey,
      mode: 'device',
      iterations: 1000,
    });

    expect(rewrapped.password).toBeUndefined();
    expect(rewrapped.device).toBeDefined();
    expect(rewrapped.tokens).toBeUndefined();
    expect(rewrapped.token).toBeDefined();
    const secrets = await vault.unlockWithDevice(rewrapped);
    expect(secrets.token).toBe(token);
    expect(secrets.tokens).toEqual({});
  });

  it('removes one repository token but refuses to remove the last one', async () => {
    const vault = await freshVault();
    const created = await vault.createVault({ repoKey, token, mode: 'password', password, iterations: 1000 });
    const withSecond = await vault.addRepoTokenToVault(created.payload, created.dataKey, repoKeyB, tokenB);

    const removed = vault.removeRepoTokenFromVault(withSecond, repoKeyB);
    expect(removed.tokens?.[repoKeyB]).toBeUndefined();
    expect((await vault.unlockWithPassword(removed, password)).tokens).toEqual({ [repoKey]: token });

    expect(() => vault.removeRepoTokenFromVault(removed, repoKey)).toThrowError(/最后一个/);
  });

  it('replaces every repository token in one write and drops the legacy token', async () => {
    const vault = await freshVault();
    const created = await vault.createVault({ repoKey, token, mode: 'password', password, iterations: 1000 });
    const withSecond = await vault.addRepoTokenToVault(created.payload, created.dataKey, repoKeyB, tokenB);
    const withLegacy: VaultPayload = {
      ...withSecond,
      token: { iv: 'legacy-iv', ciphertext: 'legacy-ciphertext' },
    };

    const replaced = await vault.replaceRepoTokensInVault(withLegacy, created.dataKey, {
      [repoKey]: ' new-a ',
      [repoKeyB]: 'new-b',
    });

    expect(replaced.token).toBeUndefined();
    expect(Object.keys(replaced.tokens ?? {}).sort()).toEqual([repoKey, repoKeyB].sort());
    await expect(vault.unlockWithPassword(replaced, password)).resolves.toMatchObject({
      token: null,
      tokens: { [repoKey]: 'new-a', [repoKeyB]: 'new-b' },
    });
    const persisted = localStorage.getItem(vault.VAULT_STORAGE_KEY) ?? '';
    expect(persisted).not.toContain('new-a');
    expect(persisted).not.toContain('new-b');
    expect(persisted).not.toContain(token);
    expect(persisted).not.toContain(tokenB);
  });

  it('refuses to replace the token map with an empty one', async () => {
    const vault = await freshVault();
    const created = await vault.createVault({ repoKey, token, mode: 'password', password, iterations: 1000 });

    await expect(vault.replaceRepoTokensInVault(created.payload, created.dataKey, {})).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('migrates a legacy single token to the active repository', async () => {
    const crypto = await (async () => {
      vi.resetModules();
      return import('@/lib/vault/crypto');
    })();
    const vault = await freshVault();
    const dataKey = crypto.randomBytes(32);
    const tokenKey = await crypto.importAesKey(dataKey);
    const tokenEncrypted = await crypto.encryptBytes(tokenKey, encodeUtf8(token), crypto.AAD_TOKEN);
    const salt = crypto.randomBytes(16);
    const kek = await crypto.deriveKek(crypto.passphraseForPassword(password), salt, 1000);
    const wrapped = await crypto.encryptBytes(kek, dataKey, crypto.AAD_KEY_PASSWORD);
    const payload: VaultPayload = {
      v: 1,
      kdf: { name: 'PBKDF2-SHA256', iterations: 1000 },
      password: {
        salt: bytesToBase64(salt),
        iv: bytesToBase64(wrapped.iv),
        wrappedKey: bytesToBase64(wrapped.ciphertext),
        requireDevice: false,
      },
      token: { iv: bytesToBase64(tokenEncrypted.iv), ciphertext: bytesToBase64(tokenEncrypted.ciphertext) },
      createdAt: new Date().toISOString(),
    };

    const migrated = await vault.migrateLegacyTokenToRepo(payload, dataKey, token, repoKey);
    expect(migrated.token).toBeUndefined();
    expect(migrated.tokens?.[repoKey]).toBeDefined();
    const secrets = await vault.unlockWithPassword(migrated, password);
    expect(secrets.token).toBeNull();
    expect(secrets.tokens[repoKey]).toBe(token);
  });

  it('keeps the session lookup separate per repository and falls back to a legacy token', async () => {
    const dataKey = new Uint8Array(32).fill(7);
    vaultSession.set(null, dataKey, { [repoKey]: token, [repoKeyB]: tokenB });
    expect(vaultSession.getTokenForRepo(repoKey)).toBe(token);
    expect(vaultSession.getTokenForRepo(repoKeyB)).toBe(tokenB);
    expect(vaultSession.getTokenForRepo('unknown/repo')).toBeNull();
    vaultSession.setRepoToken('unknown/repo', 'new-token');
    expect(vaultSession.getTokenForRepo('unknown/repo')).toBe('new-token');

    vaultSession.set('legacy-token', dataKey);
    expect(vaultSession.getTokenForRepo(repoKey)).toBe('legacy-token');
    // A new/inactive repository must not borrow the legacy active-repo token.
    expect(vaultSession.getStoredTokenForRepo(repoKey)).toBeNull();
    expect(vaultSession.hasStoredTokenForRepo(repoKey)).toBe(false);
  });
});

describe('vault rewrap while unlocked', () => {
  it('reuses the data key so encrypted backups stay readable', async () => {
    const vault = await freshVault();
    const created = await vault.createVault({ repoKey, token, mode: 'password', password, iterations: 1000 });
    const rewrapped = await vault.rewrapVault({
      tokens: { [repoKey]: token },
      dataKey: created.dataKey,
      mode: 'two-factor',
      password: newPassword,
      iterations: 1000,
    });

    expect(vault.vaultModeOf(rewrapped)).toBe('two-factor');
    expect(rewrapped.device).toBeUndefined();
    expect(rewrapped.token).toBeUndefined();
    expect(rewrapped.tokens?.[repoKey]?.ciphertext).not.toBe(created.payload.tokens?.[repoKey]?.ciphertext);

    const secrets = await vault.unlockWithPassword(rewrapped, newPassword);
    expect(secrets.tokens[repoKey]).toBe(token);
    expect([...secrets.dataKey]).toEqual([...created.dataKey]);
    await expect(vault.unlockWithPassword(rewrapped, password)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });

  it('can drop the password and fall back to device-only', async () => {
    const vault = await freshVault();
    const created = await vault.createVault({ repoKey, token, mode: 'two-factor', password, iterations: 1000 });
    const deviceOnly = await vault.rewrapVault({
      tokens: { [repoKey]: token },
      dataKey: created.dataKey,
      mode: 'device',
      iterations: 1000,
    });

    expect(deviceOnly.password).toBeUndefined();
    expect(deviceOnly.device).toBeDefined();
    expect(vault.vaultModeOf(deviceOnly)).toBe('device');
    const secrets = await vault.unlockWithDevice(deviceOnly);
    expect(secrets.tokens[repoKey]).toBe(token);
  });
});

describe('verify vault password', () => {
  it('accepts the current password and leaves localStorage untouched', async () => {
    const vault = await freshVault();
    await vault.createVault({ repoKey, token, mode: 'password', password, iterations: 1000 });
    const before = localStorage.getItem(vault.VAULT_STORAGE_KEY);

    await expect(vault.verifyVaultPassword(password)).resolves.toBeUndefined();

    expect(localStorage.getItem(vault.VAULT_STORAGE_KEY)).toBe(before);
  });

  it('rejects a wrong password', async () => {
    const vault = await freshVault();
    await vault.createVault({ repoKey, token, mode: 'password', password, iterations: 1000 });

    await expect(vault.verifyVaultPassword('wrong password')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });

  it('rejects device-only and missing vaults without a password envelope', async () => {
    const vault = await freshVault();
    await expect(vault.verifyVaultPassword(password)).rejects.toMatchObject({ code: 'NO_METHOD' });

    await vault.createVault({ repoKey, token, mode: 'device', iterations: 1000 });
    await expect(vault.verifyVaultPassword(password)).rejects.toMatchObject({ code: 'NO_METHOD' });
  });

  it('checks only the data key, so a corrupt PAT envelope does not block the confirmation', async () => {
    const vault = await freshVault();
    const { payload } = await vault.createVault({ repoKey, token, mode: 'password', password, iterations: 1000 });
    const envelope = payload.tokens?.[repoKey];
    expect(envelope).toBeDefined();
    if (!envelope) return;
    const tampered: VaultPayload = {
      ...payload,
      tokens: {
        ...payload.tokens,
        [repoKey]: { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA` },
      },
    };
    vault.saveVault(tampered);
    const before = localStorage.getItem(vault.VAULT_STORAGE_KEY);

    await expect(vault.verifyVaultPassword(password)).resolves.toBeUndefined();
    expect(localStorage.getItem(vault.VAULT_STORAGE_KEY)).toBe(before);
    await expect(vault.unlockWithPassword(tampered, password)).rejects.toMatchObject({ code: 'CORRUPT' });
  });
});
