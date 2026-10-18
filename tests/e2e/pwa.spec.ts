import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/** vite preview 直接服务 dist，所以这里改的是真实产物里的 sw.js。 */
const SERVICE_WORKER_PATH = resolve('dist/sw.js');

let originalServiceWorker = '';

async function waitForActiveRegistration(page: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return Boolean(registration?.active);
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

test.describe('pwa', () => {
  test.beforeAll(() => {
    originalServiceWorker = readFileSync(SERVICE_WORKER_PATH, 'utf8');
  });

  test.afterAll(() => {
    if (originalServiceWorker) writeFileSync(SERVICE_WORKER_PATH, originalServiceWorker, 'utf8');
  });

  test('serves an installable manifest, its icons and a precaching service worker', async ({ page, request }) => {
    await page.goto('/?demo=1');
    await expect(page.getByText('今天写点什么？')).toBeVisible();

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBe('/manifest.webmanifest');

    const manifestResponse = await request.get('/manifest.webmanifest');
    expect(manifestResponse.status()).toBe(200);
    const manifest = (await manifestResponse.json()) as {
      name: string;
      short_name: string;
      display: string;
      theme_color: string;
      start_url: string;
      scope: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    };
    expect(manifest.name).toBe('Astro Blog Studio');
    expect(manifest.short_name).toBe('Studio');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#FFFBF5');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.icons.map((icon) => icon.purpose)).toContain('maskable');
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));

    for (const icon of manifest.icons) {
      const iconResponse = await request.get(`/${icon.src}`);
      expect(iconResponse.status()).toBe(200);
      expect(iconResponse.headers()['content-type']).toContain('image/png');
    }

    const serviceWorkerResponse = await request.get('/sw.js');
    expect(serviceWorkerResponse.status()).toBe(200);
    const serviceWorkerSource = await serviceWorkerResponse.text();
    // 预缓存清单必须含入口 HTML，否则离线导航没有回退页面。
    expect(serviceWorkerSource).toContain('index.html');
    expect(serviceWorkerSource).toContain('manifest.webmanifest');

    await waitForActiveRegistration(page);
  });

  test('opens from the precache while the network is offline', async ({ page, context }) => {
    test.slow();

    await page.goto('/?demo=1');
    await waitForActiveRegistration(page);

    // 首次安装不会立刻接管页面，刷新一次让新 SW 控住导航。
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('今天写点什么？')).toBeVisible();
    await expect(page.getByText('演示模式').first()).toBeVisible();
    await context.setOffline(false);

    const cachedOrigins = await page.evaluate(async () => {
      const origins = new Set<string>();
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const entry of await cache.keys()) origins.add(new URL(entry.url).origin);
      }
      return [...origins];
    });
    expect(cachedOrigins).toContain('http://localhost:4174');
    expect(cachedOrigins).not.toContain('https://api.github.com');
  });

  test('prompts when a new version is waiting and reloads only on demand', async ({ page }) => {
    test.slow();

    await page.goto('/?demo=1');
    await waitForActiveRegistration(page);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    // 模拟一次新部署：改动 sw.js 字节，预缓存清单本身不变。
    appendFileSync(SERVICE_WORKER_PATH, `\n// e2e update ${Date.now()}\n`, 'utf8');
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('网站有新版本')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '稍后' })).toBeVisible();

    // 「稍后」只收起弹窗，顶栏徽标保留。
    await dialog.getByRole('button', { name: '稍后' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '有新版本，查看更新提示' })).toBeVisible();

    await page.getByRole('button', { name: '有新版本，查看更新提示' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();

    const reloaded = page.waitForEvent('load');
    await page.getByRole('button', { name: '立即刷新' }).click();
    await reloaded;
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText('今天写点什么？')).toBeVisible();

    // 关键断言：刷新必须真的让 waiting 的 SW 接管，而不是只重载页面又弹一次提示。
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return Boolean(registration?.waiting);
        }),
      )
      .toBe(false);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  });
});
