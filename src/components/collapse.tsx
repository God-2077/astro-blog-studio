import { ChevronDown } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { cn } from '@/lib/utils/cn';

/** 手机竖屏（<768px）默认折叠，平板/桌面默认展开。 */
const WIDE_QUERY = '(min-width: 768px)';

function defaultExpanded(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(WIDE_QUERY).matches;
}

interface CollapseProps {
  title: ReactNode;
  meta?: ReactNode;
  tape?: 'blush' | 'mint';
  className?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/**
 * 设置页的分区折叠面板。展开状态只在挂载时按视口决定，之后交给用户；
 * body 保留在 DOM 里并用 hidden 隐藏，保证 aria-controls 目标稳定。
 */
export function Collapse({ title, meta, tape, className, children, defaultOpen }: CollapseProps) {
  const [open, setOpen] = useState(() => defaultOpen ?? defaultExpanded());
  const regionId = useId();

  return (
    <section className={cn('abs-paper relative', className)} data-open={open ? 'true' : 'false'}>
      {tape ? <span className={cn('abs-tape', tape === 'mint' && 'abs-tape-mint')} aria-hidden /> : null}
      <h2 className="font-display">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3.5 py-3 text-left"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="flex min-w-0 items-center gap-1.5 text-[16px] font-bold leading-snug">{title}</span>
          {meta ? <span className="ml-auto shrink-0 font-mono text-[9px] font-normal text-muted">{meta}</span> : null}
          <ChevronDown aria-hidden className={cn('size-3.5 shrink-0 text-muted transition-transform', !open && '-rotate-90')} />
        </button>
      </h2>
      <div id={regionId} className="abs-collapse-body px-3.5 pb-3.5" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
