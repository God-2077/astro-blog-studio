export type ErrorCode =
  | 'AUTH_INVALID'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SECONDARY_LIMIT'
  | 'EMPTY_REPO'
  | 'SERVER'
  | 'NETWORK'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

const MESSAGES: Record<ErrorCode, string> = {
  AUTH_INVALID: '令牌无效或已过期，请重新输入 PAT。',
  FORBIDDEN: '令牌没有这个仓库或分支的权限，或分支被保护。',
  NOT_FOUND: '没有找到仓库、分支或文件，请检查设置。',
  CONFLICT: '远端文件已经变化，保存前需要先处理冲突。',
  RATE_LIMITED: 'GitHub API 配额用完了，请等重置后再试。',
  SECONDARY_LIMIT: 'GitHub 触发了二级限流，请稍等再试。',
  EMPTY_REPO: '仓库是空的，请先创建一次初始提交。',
  SERVER: 'GitHub 返回了服务器错误，稍后重试。',
  NETWORK: '网络不可用，检查连接后再试。',
  UNSUPPORTED: '这个文件不受支持（过大或不是 UTF-8）。',
  UNKNOWN: '发生了未知错误。',
};

interface HttpLike {
  status?: number;
  message?: string;
  response?: {
    headers?: Record<string, string>;
    data?: { message?: string };
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  readonly resetAt?: number;
  readonly detail?: string;

  constructor(
    code: ErrorCode,
    options: { status?: number; detail?: string; retryAfterSeconds?: number; resetAt?: number; message?: string } = {},
  ) {
    super(options.message ?? MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status;
    this.detail = options.detail;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.resetAt = options.resetAt;
  }
}

export function mapError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const candidate = error as HttpLike & { name?: string };
  const status = candidate?.status;
  const headers = candidate?.response?.headers ?? {};
  const remaining = headers['x-ratelimit-remaining'];
  const reset = headers['x-ratelimit-reset'];
  const retryAfter = headers['retry-after'];

  if (candidate?.name === 'HttpError' || candidate?.name === 'RequestError') {
    if (status === 401) return new AppError('AUTH_INVALID', { status });
    if (status === 403 && remaining === '0') {
      return new AppError('RATE_LIMITED', { status, resetAt: reset ? Number(reset) * 1000 : undefined });
    }
    if (status === 403) {
      return new AppError('FORBIDDEN', { status, detail: candidate.response?.data?.message });
    }
    if (status === 404) return new AppError('NOT_FOUND', { status });
    if (status === 409) {
      const detail = candidate.response?.data?.message ?? candidate.message ?? '';
      if (/empty/i.test(detail)) return new AppError('EMPTY_REPO', { status, detail });
      return new AppError('CONFLICT', { status });
    }
    if (status === 422) return new AppError('CONFLICT', { status, detail: candidate.response?.data?.message });
    if (status === 429) {
      return new AppError('SECONDARY_LIMIT', {
        status,
        retryAfterSeconds: retryAfter ? Number(retryAfter) : 30,
      });
    }
    if (status && status >= 500) return new AppError('SERVER', { status });
  }

  if (error instanceof TypeError) return new AppError('NETWORK', { detail: error.message });
  return new AppError('UNKNOWN', { detail: error instanceof Error ? error.message : String(error) });
}

export function isWriteConflict(error: unknown): boolean {
  const mapped = mapError(error);
  return mapped.code === 'CONFLICT';
}
