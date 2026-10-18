import { describe, expect, it } from 'vitest';
import { createLimiter } from '@/lib/utils/limiter';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('createLimiter', () => {
  it('never runs more than max tasks at once', async () => {
    const run = createLimiter(2);
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 6 }, () =>
        run(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await tick();
          active -= 1;
        }),
      ),
    );

    expect(peak).toBe(2);
  });

  it('serializes when max is 1', async () => {
    const run = createLimiter(1);
    const order: string[] = [];
    await Promise.all([
      run(async () => {
        order.push('a-start');
        await tick();
        order.push('a-end');
      }),
      run(async () => {
        order.push('b-start');
        await tick();
        order.push('b-end');
      }),
    ]);

    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('frees the slot when a task rejects', async () => {
    const run = createLimiter(1);
    await expect(
      run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(run(async () => 'ok')).resolves.toBe('ok');
  });

  it('treats a non-positive max as 1', async () => {
    const run = createLimiter(0);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 3 }, () =>
        run(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await tick();
          active -= 1;
        }),
      ),
    );
    expect(peak).toBe(1);
  });
});
