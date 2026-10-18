import { sha256Hex } from './crypto';

export interface DeviceId {
  id: string;
  source: 'fpjs' | 'local';
}

let cached: DeviceId | null = null;

async function localFingerprint(): Promise<string> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const screenValue = typeof screen === 'undefined' ? 'no-screen' : `${screen.width}x${screen.height}x${screen.colorDepth}`;
  const parts = [
    nav?.userAgent ?? 'no-ua',
    nav?.platform ?? 'no-platform',
    nav?.language ?? 'no-language',
    String(nav?.hardwareConcurrency ?? 0),
    screenValue,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    new Date().getTimezoneOffset().toString(),
  ];
  return `local:${await sha256Hex(parts.join('|'))}`;
}

async function fpjsFingerprint(): Promise<string> {
  const module = await import('@fingerprintjs/fingerprintjs');
  const FingerprintJS = module.default;
  const agent = await FingerprintJS.load();
  const result = await agent.get();
  return `fpjs:${result.visitorId}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fingerprint timeout')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function getDeviceId(timeoutMs = 3000): Promise<DeviceId> {
  if (cached) return cached;
  try {
    const result = await withTimeout(fpjsFingerprint(), timeoutMs);
    cached = { id: result, source: 'fpjs' };
  } catch {
    cached = { id: await localFingerprint(), source: 'local' };
  }
  return cached;
}

export async function getDeviceIdForSource(source: 'fpjs' | 'local'): Promise<string> {
  const result = await getDeviceId();
  if (result.source !== source) {
    throw new Error('设备指纹来源不可用');
  }
  return result.id;
}
