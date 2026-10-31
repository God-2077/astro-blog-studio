import { describe, expect, it, vi } from 'vitest';
import type { VaultPayload } from '@/lib/vault/keystore';

// 单元测试环境没有 FingerprintJS 需要的浏览器 API：强制它失败，走本地指纹回退路径。
vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: {
    load: async () => {
      throw new Error('fingerprintjs unavailable in unit tests');
    },
  },
}));

const token = 'github_pat_fingerprint_test_token';

function setScreen(width: number, height: number, colorDepth = 24): void {
  Object.defineProperty(globalThis, 'screen', {
    configurable: true,
    writable: true,
    value: { width, height, colorDepth },
  });
}

/** 修复前的本地指纹算法（含窗口尺寸熵），用来构造旧格式保险库。 */
async function legacyLocalFingerprint(): Promise<string> {
  const { sha256Hex } = await import('@/lib/vault/crypto');
  const nav = navigator;
  const parts = [
    nav?.userAgent ?? 'no-ua',
    nav?.platform ?? 'no-platform',
    nav?.language ?? 'no-language',
    String(nav?.hardwareConcurrency ?? 0),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Date().getTimezoneOffset().toString(),
  ];
  return `local:${await sha256Hex(parts.join('|'))}`;
}

async function createLegacyLocalVault(legacyId: string): Promise<VaultPayload> {
  const crypto = await import('@/lib/vault/crypto');
  const { bytesToBase64, encodeUtf8 } = await import('@/lib/utils/encoding');
  const iterations = 1000;

  const dataKey = crypto.randomBytes(32);
  const tokenKey = await crypto.importAesKey(dataKey);
  const encryptedToken = await crypto.encryptBytes(tokenKey, encodeUtf8(token), crypto.AAD_TOKEN);

  const salt = crypto.randomBytes(16);
  const kek = await crypto.deriveKek(crypto.passphraseForDevice(legacyId), salt, iterations);
  const wrappedKey = await crypto.encryptBytes(kek, dataKey, crypto.AAD_KEY_DEVICE);

  return {
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations },
    device: {
      salt: bytesToBase64(salt),
      iv: bytesToBase64(wrappedKey.iv),
      wrappedKey: bytesToBase64(wrappedKey.ciphertext),
      source: 'local',
    },
    token: {
      iv: bytesToBase64(encryptedToken.iv),
      ciphertext: bytesToBase64(encryptedToken.ciphertext),
    },
    createdAt: new Date().toISOString(),
  };
}

async function loadFingerprint() {
  vi.resetModules();
  return import('@/lib/vault/fingerprint');
}

/** 旧算法时代创建的双因子保险库：设备包装和密码包装都绑定旧指纹。 */
async function createLegacyPasswordVault(legacyId: string, password: string): Promise<VaultPayload> {
  const crypto = await import('@/lib/vault/crypto');
  const { bytesToBase64, encodeUtf8 } = await import('@/lib/utils/encoding');
  const iterations = 1000;

  const dataKey = crypto.randomBytes(32);
  const tokenKey = await crypto.importAesKey(dataKey);
  const encryptedToken = await crypto.encryptBytes(tokenKey, encodeUtf8(token), crypto.AAD_TOKEN);

  const deviceSalt = crypto.randomBytes(16);
  const deviceKek = await crypto.deriveKek(crypto.passphraseForDevice(legacyId), deviceSalt, iterations);
  const deviceWrapped = await crypto.encryptBytes(deviceKek, dataKey, crypto.AAD_KEY_DEVICE);

  const passwordSalt = crypto.randomBytes(16);
  const passwordKek = await crypto.deriveKek(crypto.passphraseForPassword(password, legacyId), passwordSalt, iterations);
  const passwordWrapped = await crypto.encryptBytes(passwordKek, dataKey, crypto.AAD_KEY_PASSWORD);

  return {
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations },
    device: {
      salt: bytesToBase64(deviceSalt),
      iv: bytesToBase64(deviceWrapped.iv),
      wrappedKey: bytesToBase64(deviceWrapped.ciphertext),
      source: 'local',
    },
    password: {
      salt: bytesToBase64(passwordSalt),
      iv: bytesToBase64(passwordWrapped.iv),
      wrappedKey: bytesToBase64(passwordWrapped.ciphertext),
      requireDevice: true,
    },
    token: {
      iv: bytesToBase64(encryptedToken.iv),
      ciphertext: bytesToBase64(encryptedToken.ciphertext),
    },
    createdAt: new Date().toISOString(),
  };
}

async function loadKeystore() {
  vi.resetModules();
  return import('@/lib/vault/keystore');
}

/** 只含密码包装（requireDevice=true）的旧版双因子保险库，没有独立设备包装。 */
async function createLegacyTwoFactorVault(legacyId: string, password: string): Promise<VaultPayload> {
  const crypto = await import('@/lib/vault/crypto');
  const { bytesToBase64, encodeUtf8 } = await import('@/lib/utils/encoding');
  const iterations = 1000;

  const dataKey = crypto.randomBytes(32);
  const tokenKey = await crypto.importAesKey(dataKey);
  const encryptedToken = await crypto.encryptBytes(tokenKey, encodeUtf8(token), crypto.AAD_TOKEN);

  const passwordSalt = crypto.randomBytes(16);
  const passwordKek = await crypto.deriveKek(crypto.passphraseForPassword(password, legacyId), passwordSalt, iterations);
  const passwordWrapped = await crypto.encryptBytes(passwordKek, dataKey, crypto.AAD_KEY_PASSWORD);

  return {
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations },
    password: {
      salt: bytesToBase64(passwordSalt),
      iv: bytesToBase64(passwordWrapped.iv),
      wrappedKey: bytesToBase64(passwordWrapped.ciphertext),
      requireDevice: true,
    },
    token: {
      iv: bytesToBase64(encryptedToken.iv),
      ciphertext: bytesToBase64(encryptedToken.ciphertext),
    },
    createdAt: new Date().toISOString(),
  };
}

/** 直接用稳定的本机指纹派生 KEK 解开密码包装，证明迁移真的改了绑定。 */
async function unwrapPasswordWrapWith(payload: VaultPayload, password: string, deviceId: string): Promise<string> {
  const crypto = await import('@/lib/vault/crypto');
  const { base64ToBytes, decodeUtf8 } = await import('@/lib/utils/encoding');
  const wrap = payload.password;
  if (!wrap) throw new Error('payload has no password wrap');
  const kek = await crypto.deriveKek(
    crypto.passphraseForPassword(password, deviceId),
    base64ToBytes(wrap.salt),
    payload.kdf.iterations,
  );
  const dataKey = await crypto.decryptBytes(
    kek,
    base64ToBytes(wrap.iv),
    base64ToBytes(wrap.wrappedKey),
    crypto.AAD_KEY_PASSWORD,
  );
  const tokenKey = await crypto.importAesKey(dataKey);
  const legacy = payload.token;
  if (!legacy) throw new Error('payload has no legacy token');
  return decodeUtf8(
    await crypto.decryptBytes(tokenKey, base64ToBytes(legacy.iv), base64ToBytes(legacy.ciphertext), crypto.AAD_TOKEN),
  );
}

describe('device fingerprint stability', () => {
  it('keeps the fingerprint stable when the window/screen size changes', async () => {
    setScreen(1440, 900);
    const first = await (await loadFingerprint()).getDeviceId();
    expect(first.source).toBe('local');

    setScreen(1024, 768);
    const second = await (await loadFingerprint()).getDeviceId();

    expect(second.id).toBe(first.id);
  });

  it('offers the legacy window-dependent fingerprint as a compatibility candidate', async () => {
    setScreen(1280, 800);
    const legacyId = await legacyLocalFingerprint();
    const candidates = await (await loadFingerprint()).getDeviceIdCandidates('local');

    expect(candidates[0]?.id).not.toBe(legacyId);
    expect(candidates.map((candidate) => candidate.id)).toContain(legacyId);
  });

  it('unlocks a legacy vault and migrates it to the stable fingerprint', async () => {
    setScreen(1440, 900);
    const legacyId = await legacyLocalFingerprint();
    const payload = await createLegacyLocalVault(legacyId);

    const keystore = await loadKeystore();
    keystore.saveVault(payload);
    await expect(keystore.unlockWithDevice(payload)).resolves.toMatchObject({ token });

    // 迁移到稳定指纹之后，窗口尺寸变化仍可自动解锁。
    setScreen(1700, 1000);
    const freshKeystore = await loadKeystore();
    const stored = freshKeystore.loadVault();
    expect(stored).toBeTruthy();
    await expect(freshKeystore.unlockWithDevice(stored as VaultPayload)).resolves.toMatchObject({ token });
  });

  it('migrates legacy fingerprint bindings after a password unlock', async () => {
    setScreen(1440, 900);
    const password = 'correct horse battery staple';
    const legacyId = await legacyLocalFingerprint();
    const payload = await createLegacyPasswordVault(legacyId, password);

    const keystore = await loadKeystore();
    keystore.saveVault(payload);
    await expect(keystore.unlockWithPassword(payload, password)).resolves.toMatchObject({ token });

    // 迁移后密码包装直接绑定稳定指纹：用稳定 id 派生 KEK 就能解开。
    const storedAfterUnlock = keystore.loadVault() as VaultPayload;
    const stable = await (await loadFingerprint()).getDeviceId();
    await expect(unwrapPasswordWrapWith(storedAfterUnlock, password, stable.id)).resolves.toBe(token);

    // 迁移到稳定指纹之后，窗口尺寸变化仍可用同一密码、也可用设备自动解锁。
    setScreen(1700, 1000);
    const freshKeystore = await loadKeystore();
    const stored = freshKeystore.loadVault();
    expect(stored).toBeTruthy();
    await expect(freshKeystore.unlockWithPassword(stored as VaultPayload, password)).resolves.toMatchObject({ token });
    await expect(freshKeystore.unlockWithDevice(stored as VaultPayload)).resolves.toMatchObject({ token });
  });

  it('migrates a legacy two-factor password wrap to the stable fingerprint', async () => {
    setScreen(1440, 900);
    const password = 'correct horse battery staple';
    const legacyId = await legacyLocalFingerprint();
    const payload = await createLegacyTwoFactorVault(legacyId, password);

    const keystore = await loadKeystore();
    keystore.saveVault(payload);
    await expect(keystore.unlockWithPassword(payload, password)).resolves.toMatchObject({ token });

    // 旧版双因子只有密码包装（requireDevice=true），迁移后应绑定稳定指纹。
    const stored = keystore.loadVault() as VaultPayload;
    expect(stored.device).toBeUndefined();
    const stable = await (await loadFingerprint()).getDeviceId();
    await expect(unwrapPasswordWrapWith(stored, password, stable.id)).resolves.toBe(token);

    // 换窗口尺寸 + 全新模块（缓存清空）后仍能用同一密码解锁。
    setScreen(1700, 1000);
    const freshKeystore = await loadKeystore();
    const reloaded = freshKeystore.loadVault() as VaultPayload;
    await expect(freshKeystore.unlockWithPassword(reloaded, password)).resolves.toMatchObject({ token });
  });

  it('reports a changed fingerprint instead of silently retrying', async () => {
    setScreen(1440, 900);
    const payload = await createLegacyLocalVault(await legacyLocalFingerprint());

    // 用完全不相干的设备 id 重新包装数据密钥，模拟「设备确实变了」。
    const crypto = await import('@/lib/vault/crypto');
    const { bytesToBase64 } = await import('@/lib/utils/encoding');
    const salt = crypto.randomBytes(16);
    const kek = await crypto.deriveKek(crypto.passphraseForDevice('local:unknown-device'), salt, payload.kdf.iterations);
    const wrapped = await crypto.encryptBytes(kek, crypto.randomBytes(32), crypto.AAD_KEY_DEVICE);
    const changed: VaultPayload = {
      ...payload,
      device: {
        salt: bytesToBase64(salt),
        iv: bytesToBase64(wrapped.iv),
        wrappedKey: bytesToBase64(wrapped.ciphertext),
        source: 'local',
      },
    };

    const keystore = await loadKeystore();
    keystore.saveVault(changed);
    await expect(keystore.unlockWithDevice(changed)).rejects.toMatchObject({ code: 'FINGERPRINT_CHANGED' });
  });
});
