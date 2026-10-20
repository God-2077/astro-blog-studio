import { useEffect, useId, useRef } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';

export interface ConfirmOptions {
  /** 补充说明：后果、影响范围或替代做法。 */
  description?: string;
  /** 确认按钮文案，默认「确认」。 */
  confirmLabel?: string;
  /** 取消按钮文案，默认「取消」。 */
  cancelLabel?: string;
  /** 破坏性操作：确认按钮用 danger 描边，不用实心樱粉。 */
  danger?: boolean;
}

interface PendingConfirm {
  id: string | number;
  settle: (confirmed: boolean) => void;
}

/** 同一时间只保留一条确认：新确认把旧确认按「取消」收口，toast 不会叠加。 */
let pending: PendingConfirm | null = null;

function ConfirmCard({
  message,
  description,
  confirmLabel,
  cancelLabel,
  danger,
  onChoose,
}: {
  message: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  onChoose: (confirmed: boolean) => void;
}) {
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // 焦点落在「取消」：随后误按 Enter 不会执行危险操作；Esc 也走同一条路径。
    cancelRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      data-abs-confirm=""
      role="group"
      aria-label={message}
      aria-describedby={description ? descriptionId : undefined}
      className="px-3.5 py-3"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onChoose(false);
      }}
    >
      <p className="font-display text-[13px] font-bold leading-relaxed text-ink">{message}</p>
      {description ? (
        <p id={descriptionId} className="mt-1 text-[11px] leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
      <div className="mt-2.5 flex items-center justify-end gap-1.5">
        <button
          ref={cancelRef}
          type="button"
          className="abs-btn abs-btn-ghost h-7 px-2.5 text-[11px]"
          onClick={() => onChoose(false)}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={cn('abs-btn h-7 px-2.5 text-[11px]', danger && 'abs-btn-danger')}
          onClick={() => onChoose(true)}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * 用 sonner toast 取代 window.confirm，返回 Promise<boolean>。
 * 只有点「确认」才 resolve(true)；「取消」、Esc、滑动关闭、被新确认顶掉都 resolve(false)，
 * 所以调用方的 await 不会永远悬挂。调用方必须在确认后继续 await 自己的异步动作。
 */
export function confirmAction(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  pending?.settle(false);
  // 记下触发确认的位置，回答后把键盘焦点还回去。
  const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let id: string | number = 0;

    const settle = (confirmed: boolean): void => {
      if (settled) return;
      settled = true;
      if (pending?.id === id) pending = null;
      // 先收掉确认条再 resolve，避免调用方跳转/刷新后提示还悬在页面上。
      toast.dismiss(id);
      if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
      resolve(confirmed);
    };

    id = toast.custom(
      () => (
        <ConfirmCard
          message={message}
          description={options.description}
          confirmLabel={options.confirmLabel ?? '确认'}
          cancelLabel={options.cancelLabel ?? '取消'}
          danger={options.danger ?? false}
          onChoose={settle}
        />
      ),
      {
        // 等用户表态，不自动消失：超时默认答案在危险操作上等同于误操作。
        duration: Number.POSITIVE_INFINITY,
        // 自定义 toast 没有 sonner 的内边距，圆角与投影落在纸面外框上。
        className: 'rounded-2xl shadow-pop',
        // sonner 在窄屏会把 li 拉满；固定成纸片宽度，避免内容缩在左侧。
        style: { width: 'min(360px, calc(100vw - 32px))' },
        onDismiss: () => settle(false),
        onAutoClose: () => settle(false),
      },
    );

    pending = { id, settle };
  });
}

/** 收起还没回答的确认，按「取消」收口（例如触发它的弹窗被关掉）。 */
export function dismissConfirm(): void {
  pending?.settle(false);
}
