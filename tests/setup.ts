import { webcrypto } from 'node:crypto';
import { config } from 'dotenv';
import { setCurrentLocale } from '@/lib/i18n/locale-state';

config({ path: '.env.local' });

// 单元测试默认用简体中文，与现有断言和产品默认一致；需要别的语言时显式 setCurrentLocale。
setCurrentLocale('zh-CN');

// jsdom / Node 的 navigator 语言不固定，固定成 zh-CN 让 detectLocale 有确定结果。
if (typeof navigator !== 'undefined') {
  try {
    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
    Object.defineProperty(navigator, 'languages', { value: ['zh-CN'], configurable: true });
  } catch {
    // 某些环境不可重定义；上方的 setCurrentLocale 仍保证默认语言。
  }
}

if (!globalThis.crypto?.subtle) {
  try {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
  } catch {
    // jsdom provides a non-configurable crypto; the tests will report it explicitly.
  }
}

// Minimal localStorage for the vault tests. The real app runs in a browser.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
    writable: false,
    configurable: true,
  });
}
