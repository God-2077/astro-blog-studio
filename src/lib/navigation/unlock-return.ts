/** 解锁成功后无法确定来源时回退到工作台。 */
export const UNLOCK_RETURN_FALLBACK = '/';

type RouteLocation = { pathname: string; search: string };

/** 把当前路由记进跳转解锁页时携带的 history state（只含 pathname + search）。 */
export function unlockReturnState(location: RouteLocation): { from: string } {
  return { from: `${location.pathname}${location.search}` };
}

function isSafeReturnPath(value: string): boolean {
  if (value.length === 0 || value.length > 2048) return false;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  // 反斜杠可能被浏览器当作路径分隔符，不能当成站内路径。
  if (value.includes('\\')) return false;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return false;
  }
  const pathname = value.split('?')[0] ?? '';
  return pathname !== '/unlock' && !pathname.startsWith('/unlock/');
}

/** 读取并校验解锁页 history state；不可信输入一律回退工作台。 */
export function resolveUnlockReturn(state: unknown): string {
  if (typeof state !== 'object' || state === null) return UNLOCK_RETURN_FALLBACK;
  const from = (state as { from?: unknown }).from;
  if (typeof from !== 'string' || !isSafeReturnPath(from)) return UNLOCK_RETURN_FALLBACK;
  return from;
}
