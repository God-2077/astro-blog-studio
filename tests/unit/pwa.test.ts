// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUpdateChecker, startUpdatePolling } from '@/lib/pwa/update-polling';

describe('createUpdateChecker', () => {
  it('checks right away and then respects the minimum gap', async () => {
    let now = 0;
    const check = vi.fn(async () => {});
    const checker = createUpdateChecker({ check, minGapMs: 10_000, now: () => now });

    await checker.run();
    expect(check).toHaveBeenCalledTimes(1);

    now = 5_000;
    await checker.run();
    expect(check).toHaveBeenCalledTimes(1);

    now = 10_000;
    await checker.run();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('lets a forced run bypass the gap', async () => {
    const check = vi.fn(async () => {});
    const checker = createUpdateChecker({ check, minGapMs: 10_000, now: () => 0 });

    await checker.run();
    await checker.run(true);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('collapses concurrent runs into one check', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const check = vi.fn(async () => {
      await gate;
    });
    const checker = createUpdateChecker({ check, minGapMs: 0 });

    const first = checker.run();
    const second = checker.run();
    release();
    await Promise.all([first, second]);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('swallows failures and still checks again later', async () => {
    let now = 0;
    const check = vi.fn(async () => {
      throw new Error('offline');
    });
    const checker = createUpdateChecker({ check, minGapMs: 10_000, now: () => now });

    await expect(checker.run()).resolves.toBeUndefined();
    now = 20_000;
    await checker.run();
    expect(check).toHaveBeenCalledTimes(2);
  });
});

describe('startUpdatePolling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls on the interval only while the page is visible and online', async () => {
    vi.useFakeTimers();
    let visible = true;
    let online = true;
    const update = vi.fn(async () => {});
    const stop = startUpdatePolling(update, {
      intervalMs: 60_000,
      minGapMs: 0,
      isVisible: () => visible,
      isOnline: () => online,
    });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(update).toHaveBeenCalledTimes(1);

    visible = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(update).toHaveBeenCalledTimes(1);

    visible = true;
    online = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(update).toHaveBeenCalledTimes(1);

    online = true;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(update).toHaveBeenCalledTimes(2);

    stop();
  });

  it('checks when the window regains focus or the network comes back', async () => {
    const update = vi.fn(async () => {});
    const stop = startUpdatePolling(update, { intervalMs: 600_000, minGapMs: 0 });

    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2));

    stop();
  });

  it('checks when the page becomes visible again', async () => {
    const update = vi.fn(async () => {});
    const stop = startUpdatePolling(update, { intervalMs: 600_000, minGapMs: 0, isVisible: () => true });

    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));

    stop();
  });

  it('stops polling after cleanup', async () => {
    vi.useFakeTimers();
    const update = vi.fn(async () => {});
    const stop = startUpdatePolling(update, { intervalMs: 60_000, minGapMs: 0 });

    stop();
    await vi.advanceTimersByTimeAsync(180_000);
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(update).not.toHaveBeenCalled();
  });
});
