import { webcrypto } from 'node:crypto';
import { config } from 'dotenv';

config({ path: '.env.local' });

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
