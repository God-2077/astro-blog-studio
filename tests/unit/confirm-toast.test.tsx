// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Toaster } from 'sonner';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmAction, dismissConfirm } from '@/components/confirm-toast';

function stubMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

describe('confirmAction', () => {
  beforeEach(() => {
    stubMatchMedia();
    render(<Toaster position="top-center" />);
  });

  afterEach(() => {
    dismissConfirm();
    cleanup();
  });

  it('只在点确认后 resolve(true)', async () => {
    let answered = false;
    const answer = confirmAction('删除这份草稿？', { confirmLabel: '删除草稿', danger: true }).then((value) => {
      answered = true;
      return value;
    });

    const confirmButton = await screen.findByRole('button', { name: '删除草稿' });
    // 确认条出现时调用方仍在等待，不会自己往下走。
    expect(answered).toBe(false);

    fireEvent.click(confirmButton);
    await expect(answer).resolves.toBe(true);
  });

  it('点取消 resolve(false)，调用方不执行后续动作', async () => {
    const answer = confirmAction('离开编辑器？', { confirmLabel: '离开', cancelLabel: '继续编辑' });
    fireEvent.click(await screen.findByRole('button', { name: '继续编辑' }));
    await expect(answer).resolves.toBe(false);
  });

  it('新确认顶掉旧确认时，旧调用方收到取消', async () => {
    const first = confirmAction('第一条确认');
    const second = confirmAction('第二条确认');

    await expect(first).resolves.toBe(false);

    dismissConfirm();
    await expect(second).resolves.toBe(false);
  });

  it('外部收起确认按取消收口，await 不会悬挂', async () => {
    const answer = confirmAction('重置保险库？');
    dismissConfirm();
    await expect(answer).resolves.toBe(false);
  });
});
