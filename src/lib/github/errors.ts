import { type MessageKey, t } from '@/lib/i18n';

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

const MESSAGE_KEYS: Record<ErrorCode, MessageKey> = {
  AUTH_INVALID: 'errors.authInvalid',
  FORBIDDEN: 'errors.forbidden',
  NOT_FOUND: 'errors.notFound',
  CONFLICT: 'errors.conflict',
  RATE_LIMITED: 'errors.rateLimited',
  SECONDARY_LIMIT: 'errors.secondaryLimit',
  EMPTY_REPO: 'errors.emptyRepo',
  SERVER: 'errors.server',
  NETWORK: 'errors.network',
  UNSUPPORTED: 'errors.unsupported',
  UNKNOWN: 'errors.unknown',
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
    super(options.message ?? t(MESSAGE_KEYS[code]));
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
