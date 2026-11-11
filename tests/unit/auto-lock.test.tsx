// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoLock } from '@/hooks/use-auto-lock';

const lock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/stores/vault', () => ({
  useVault: { getState: () => ({ lock }) },
}));

vi.mock('@/stores/settings', () => ({
  useSettings: (selector: (state: { security: { autoLockMinutes: number } }) => unknown) =>
    selector({ security: { autoLockMinutes: 15 } }),
}));

function Probe(): null {
  useAutoLock(true);
  return null;
}

function LocationLabel(): React.JSX.Element {
  const location = useLocation();
  return (
    <>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="state">{JSON.stringify(location.state)}</span>
    </>
  );
}

function renderProbe(initialEntry = '/'): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Probe />
      <LocationLabel />
    </MemoryRouter>,
  );
}

describe('useAutoLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    lock.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('locks directly after the configured minutes without asking about edits', async () => {
    renderProbe();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60_000);
    });
    expect(lock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('path').textContent).toBe('/unlock');
    expect(screen.getByTestId('state').textContent).toBe(JSON.stringify({ from: '/' }));
  });

  it('restarts the countdown on activity', async () => {
    renderProbe();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    fireEvent.mouseMove(window);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(lock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('returns to the route that was active when the lock fired', async () => {
    renderProbe('/edit?path=code.md');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60_000);
    });
    expect(lock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('path').textContent).toBe('/unlock');
    expect(screen.getByTestId('state').textContent).toBe(JSON.stringify({ from: '/edit?path=code.md' }));
  });
});
