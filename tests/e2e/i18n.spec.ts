import { expect, test } from '@playwright/test';

/** 读取 zustand persist 里已保存的界面语言（未保存时返回 null）。 */
async function storedLocale(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('abs.settings.v1');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { state?: { appearance?: { locale?: string } } };
      return parsed.state?.appearance?.locale ?? null;
    } catch {
      return null;
    }
  });
}

test.describe('i18n · 浏览器语言检测', () => {
  test.describe('en-US', () => {
    test.use({ locale: 'en-US' });

    test('首次进入 setup 显示英文并同步 html lang', async ({ page }) => {
      await page.goto('/#/setup');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.getByRole('heading', { name: 'Connect your repository' })).toBeVisible();
      await expect(page.locator('select')).toHaveValue('en');
    });
  });

  test.describe('zh-TW', () => {
    test.use({ locale: 'zh-TW' });

    test('繁体浏览器显示繁体界面', async ({ page }) => {
      await page.goto('/#/setup');
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
      await expect(page.getByRole('heading', { name: '把儲存庫接進來' })).toBeVisible();
      await expect(page.locator('select')).toHaveValue('zh-TW');
    });
  });

  test.describe('de-DE', () => {
    test.use({ locale: 'de-DE' });

    test('不在四语内的浏览器回退英语', async ({ page }) => {
      await page.goto('/#/setup');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.getByRole('heading', { name: 'Connect your repository' })).toBeVisible();
      await expect(page.locator('select')).toHaveValue('en');
    });
  });
});

test.describe('i18n · 语言选择', () => {
  test.use({ locale: 'en-US' });

  test('setup 切换日语后即时生效并在刷新后保持', async ({ page }) => {
    await page.goto('/#/setup');
    await expect(page.getByRole('heading', { name: 'Connect your repository' })).toBeVisible();

    await page.locator('select').selectOption('ja');
    await expect(page.getByRole('heading', { name: 'リポジトリをつなぐ' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect.poll(() => storedLocale(page)).toBe('ja');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'リポジトリをつなぐ' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.locator('select')).toHaveValue('ja');
  });

  test('设置的外观卡切换繁体后即时生效、持久化并刷新保持', async ({ page }) => {
    await page.goto('/?demo=1#/settings');
    const appearance = page.getByRole('button', { name: /^Appearance/ });
    await expect(appearance).toBeVisible();
    if ((await appearance.getAttribute('aria-expanded')) !== 'true') await appearance.click();
    const language = page.locator('select.abs-input');
    await expect(language).toBeVisible();

    await language.selectOption('zh-TW');
    await expect(page.getByRole('button', { name: /^外觀/ })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    await expect(page.getByText('介面語言', { exact: true }).first()).toBeVisible();
    await expect.poll(() => storedLocale(page)).toBe('zh-TW');

    await page.reload();
    await expect(page.getByRole('button', { name: /^外觀/ })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
    await expect(language).toHaveValue('zh-TW');
  });

  test('390px 下 setup 与语言选择器无横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/setup');
    await page.locator('select').selectOption('ja');
    await expect(page.getByRole('heading', { name: 'リポジトリをつなぐ' })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
