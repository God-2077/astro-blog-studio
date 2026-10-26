import type { UnknownComponents } from '@fingerprintjs/fingerprintjs';
import { sha256Hex } from './crypto';

export type DeviceSource = 'fpjs' | 'local';

export interface DeviceId {
  id: string;
  source: DeviceSource;
}

interface DeviceFingerprints {
  primary: DeviceId;
  /**
   * 修复前算法算出的指纹。旧保险库仍绑定它，解锁时作为兼容候选：
   * 一旦用旧指纹解锁成功，保险库会重新绑定到稳定指纹。
   */
  legacy: DeviceId[];
}

/**
 * 参与设备绑定的稳定熵源白名单。
 *
 * 只保留浏览器/系统级的静态属性，排除三类会漂移的测量型熵源：
 * - 窗口尺寸：`screenFrame`、`screenResolution`，窗口一改（或换显示器/缩放）就变，
 *   曾导致窗口改变后保险库再也无法自动解锁；
 * - 渲染测量：`canvas`、`audio`、`fonts`、`fontPreferences`，同一台机器不同次加载
 *   也会因字体/渲染测量时序产生差异（实测 fontPreferences.default
 *   151.703 → 151.697，mono 119 → 110.5）；
 * - 异步探测：`domBlockers` 依赖网络与扩展状态，可能时而返回 error。
 *
 * 白名单模式也保证 FingerprintJS 未来新增的熵源默认不会悄悄破坏设备绑定。
 */
const STABLE_COMPONENT_KEYS = new Set<string>([
  'userAgentData',
  'osCpu',
  'languages',
  'colorDepth',
  'deviceMemory',
  'hardwareConcurrency',
  'timezone',
  'sessionStorage',
  'localStorage',
  'indexedDB',
  'openDatabase',
  'cpuClass',
  'platform',
  'plugins',
  'touchSupport',
  'vendor',
  'vendorFlavors',
  'cookiesEnabled',
  'colorGamut',
  'invertedColors',
  'forcedColors',
  'monochrome',
  'contrast',
  'reducedMotion',
  'reducedTransparency',
  'hdr',
  'math',
  'pdfViewerEnabled',
  'architecture',
  'applePay',
  'privateClickMeasurement',
  'audioBaseLatency',
  'dateTimeLocale',
  'webGlBasics',
  'webGlExtensions',
]);

let cachedFingerprints: DeviceFingerprints | null = null;
let cachedLocalFingerprints: DeviceFingerprints | null = null;

function toFingerprints(primary: DeviceId, legacy: DeviceId[]): DeviceFingerprints {
  const seen = new Set<string>([primary.id]);
  const compatible: DeviceId[] = [];
  for (const candidate of legacy) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    compatible.push(candidate);
  }
  return { primary, legacy: compatible };
}

function localParts(includeWindowEntropy: boolean): string[] {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const parts = [
    nav?.userAgent ?? 'no-ua',
    nav?.platform ?? 'no-platform',
    nav?.language ?? 'no-language',
    String(nav?.hardwareConcurrency ?? 0),
  ];
  if (includeWindowEntropy) {
    parts.push(typeof screen === 'undefined' ? 'no-screen' : `${screen.width}x${screen.height}x${screen.colorDepth}`);
  }
  parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date().getTimezoneOffset().toString());
  return parts;
}

async function localFingerprints(): Promise<DeviceFingerprints> {
  if (!cachedLocalFingerprints) {
    const stableId = `local:${await sha256Hex(localParts(false).join('|'))}`;
    const legacyId = `local:${await sha256Hex(localParts(true).join('|'))}`;
    cachedLocalFingerprints = toFingerprints({ id: stableId, source: 'local' }, [{ id: legacyId, source: 'local' }]);
  }
  return cachedLocalFingerprints;
}

async function fpjsFingerprints(): Promise<DeviceFingerprints> {
  const module = await import('@fingerprintjs/fingerprintjs');
  const agent = await module.default.load();
  const result = await agent.get();
  const stableComponents: UnknownComponents = {};
  for (const [key, component] of Object.entries(result.components)) {
    if (!STABLE_COMPONENT_KEYS.has(key)) continue;
    stableComponents[key] = component;
  }
  if (Object.keys(stableComponents).length === 0) {
    throw new Error('没有可用的稳定指纹特征');
  }
  const stableId = `fpjs:${module.hashComponents(stableComponents)}`;
  return toFingerprints({ id: stableId, source: 'fpjs' }, [{ id: `fpjs:${result.visitorId}`, source: 'fpjs' }]);
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

async function deviceFingerprints(timeoutMs = 3000): Promise<DeviceFingerprints> {
  if (cachedFingerprints) return cachedFingerprints;
  try {
    cachedFingerprints = await withTimeout(fpjsFingerprints(), timeoutMs);
  } catch {
    cachedFingerprints = await localFingerprints();
  }
  return cachedFingerprints;
}

export async function getDeviceId(timeoutMs = 3000): Promise<DeviceId> {
  return (await deviceFingerprints(timeoutMs)).primary;
}

/**
 * 按来源返回解锁候选指纹：第一个是当前稳定指纹，后面是旧算法指纹（兼容旧保险库）。
 * 来源不可用时返回空数组，由调用方翻译成用户可读的错误。
 */
export async function getDeviceIdCandidates(source: DeviceSource, timeoutMs = 3000): Promise<DeviceId[]> {
  const fingerprints = await deviceFingerprints(timeoutMs);
  if (fingerprints.primary.source === source) {
    return [fingerprints.primary, ...fingerprints.legacy];
  }
  // 旧保险库可能绑定的来源和当前可用来源不同（例如创建时 FingerprintJS 超时，退化成了本地指纹）。
  if (source === 'local') {
    const local = await localFingerprints();
    return [local.primary, ...local.legacy];
  }
  return [];
}

/** 双因子（密码 + 设备）解锁用：按稳定性优先排列所有可用指纹。 */
export async function getAllDeviceIdCandidates(timeoutMs = 3000): Promise<DeviceId[]> {
  const fpjs = await getDeviceIdCandidates('fpjs', timeoutMs);
  const local = await getDeviceIdCandidates('local', timeoutMs);
  const seen = new Set<string>();
  const candidates: DeviceId[] = [];
  for (const candidate of [...fpjs, ...local]) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    candidates.push(candidate);
  }
  return candidates;
}
