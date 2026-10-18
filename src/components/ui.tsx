// biome-ignore-all lint/a11y/noLabelWithoutControl: Field wraps a dynamic control; the label text is visible and associated by wrapping.
import { AlertCircle, LoaderCircle, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { mapError } from '@/lib/github/errors';
import { cn } from '@/lib/utils/cn';

export type BadgeTone = 'mint' | 'butter' | 'blush' | 'ink' | 'ghost';

export function Badge({ tone = 'ghost', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={cn('abs-badge', `abs-badge-${tone}`, className)}>{children}</span>;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('abs-field', className)}>
      <span>{label}</span>
      {children}
      {hint ? <small className="text-[10px] leading-relaxed text-muted">{hint}</small> : null}
    </label>
  );
}

export function Spinner({ label = '加载中' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-muted" role="status">
      <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
      {label}
    </span>
  );
}

export function ErrorNote({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const mapped = mapError(error);
  return (
    <div
      className={cn(
        'rounded-xl border border-danger/30 bg-[var(--abs-danger-surface)] p-3 text-[11px] leading-relaxed',
        className,
      )}
      role="alert"
    >
      <p className="flex items-start gap-2 font-semibold text-danger">
        <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {mapped.message}
      </p>
      {mapped.detail ? <p className="mt-1 break-words pl-5.5 text-muted">{mapped.detail}</p> : null}
      {onRetry ? (
        <button type="button" className="abs-btn abs-btn-ghost mt-2 h-7 px-2.5 text-[10px]" onClick={onRetry}>
          <RotateCw aria-hidden className="size-3" />
          重试
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-[var(--abs-empty-surface)] px-5 py-10 text-center">
      <strong className="font-display text-[16px]">{title}</strong>
      {children ? <p className="max-w-[46ch] text-[11.5px] leading-relaxed text-muted">{children}</p> : null}
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="abs-kbd">{children}</kbd>;
}

const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const;

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {SKELETON_KEYS.slice(0, Math.min(rows, SKELETON_KEYS.length)).map((key, index) => (
        <div key={key} className="space-y-1.5">
          <span className="abs-skeleton" style={{ width: `${80 - index * 8}%` }} />
          <span className="abs-skeleton" style={{ width: `${55 - index * 4}%`, height: 6 }} />
        </div>
      ))}
    </div>
  );
}
