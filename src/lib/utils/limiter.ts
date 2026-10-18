export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Run at most `max` tasks at once. Slots are handed directly to the next waiter,
 * so a failing task never leaks a slot.
 */
export function createLimiter(max: number): Limiter {
  const limit = Number.isFinite(max) && max > 0 ? Math.trunc(max) : 1;
  let active = 0;
  const waiting: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  };

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}
