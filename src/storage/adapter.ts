// Единый интерфейс хранилища: Telegram CloudStorage в продакшене,
// localStorage при локальной разработке, память — в тестах.

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  getItems(keys: string[]): Promise<Record<string, string | null>>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  removeItems(keys: string[]): Promise<void>;
  getKeys(): Promise<string[]>;
}

export const MAX_VALUE_LEN = 4096;
export const MAX_KEYS = 1024;
const KEY_RE = /^[A-Za-z0-9_-]{1,128}$/;

function assertKV(key: string, value?: string): void {
  if (!KEY_RE.test(key)) throw new Error(`Недопустимый ключ CloudStorage: ${key}`);
  if (value !== undefined && value.length > MAX_VALUE_LEN)
    throw new Error(`Значение для ${key} длиннее ${MAX_VALUE_LEN} символов (${value.length})`);
}

// --- Telegram CloudStorage (Bot API 6.9+, колбэки -> промисы) ---

interface TgCloudStorage {
  setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void;
  getItem(key: string, cb: (err: string | null, value?: string) => void): void;
  getItems(keys: string[], cb: (err: string | null, values?: Record<string, string>) => void): void;
  removeItem(key: string, cb?: (err: string | null, ok?: boolean) => void): void;
  removeItems(keys: string[], cb?: (err: string | null, ok?: boolean) => void): void;
  getKeys(cb: (err: string | null, keys?: string[]) => void): void;
}

const GET_BATCH = 100;

export function telegramAdapter(cs: TgCloudStorage): StorageAdapter {
  return {
    getItem: (key) =>
      new Promise((res, rej) =>
        cs.getItem(key, (err, value) => (err ? rej(new Error(err)) : res(value ?? null))),
      ),
    async getItems(keys) {
      const out: Record<string, string | null> = {};
      for (let i = 0; i < keys.length; i += GET_BATCH) {
        const part = keys.slice(i, i + GET_BATCH);
        const values = await new Promise<Record<string, string>>((res, rej) =>
          cs.getItems(part, (err, v) => (err ? rej(new Error(err)) : res(v ?? {}))),
        );
        for (const k of part) {
          const v = values[k];
          out[k] = v === undefined || v === '' ? null : v;
        }
      }
      return out;
    },
    setItem: (key, value) => {
      assertKV(key, value);
      return new Promise((res, rej) =>
        cs.setItem(key, value, (err) => (err ? rej(new Error(err)) : res())),
      );
    },
    removeItem: (key) =>
      new Promise((res, rej) => cs.removeItem(key, (err) => (err ? rej(new Error(err)) : res()))),
    removeItems: (keys) =>
      keys.length === 0
        ? Promise.resolve()
        : new Promise((res, rej) =>
            cs.removeItems(keys, (err) => (err ? rej(new Error(err)) : res())),
          ),
    getKeys: () =>
      new Promise((res, rej) => cs.getKeys((err, keys) => (err ? rej(new Error(err)) : res(keys ?? [])))),
  };
}

// --- localStorage (локальная разработка) ---

export function localAdapter(prefix = 'twa_'): StorageAdapter {
  const full = (k: string) => prefix + k;
  return {
    getItem: async (key) => localStorage.getItem(full(key)),
    getItems: async (keys) => {
      const out: Record<string, string | null> = {};
      for (const k of keys) out[k] = localStorage.getItem(full(k));
      return out;
    },
    setItem: async (key, value) => {
      assertKV(key, value);
      localStorage.setItem(full(key), value);
    },
    removeItem: async (key) => localStorage.removeItem(full(key)),
    removeItems: async (keys) => keys.forEach((k) => localStorage.removeItem(full(k))),
    getKeys: async () => {
      const out: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
      }
      return out;
    },
  };
}

// --- память (тесты) ---

export function memoryAdapter(initial?: Record<string, string>): StorageAdapter & {
  dump(): Record<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: async (key) => map.get(key) ?? null,
    getItems: async (keys) => {
      const out: Record<string, string | null> = {};
      for (const k of keys) out[k] = map.get(k) ?? null;
      return out;
    },
    setItem: async (key, value) => {
      assertKV(key, value);
      if (!map.has(key) && map.size >= MAX_KEYS) throw new Error('Превышен лимит ключей CloudStorage');
      map.set(key, value);
    },
    removeItem: async (key) => {
      map.delete(key);
    },
    removeItems: async (keys) => {
      keys.forEach((k) => map.delete(k));
    },
    getKeys: async () => [...map.keys()],
    dump: () => Object.fromEntries(map),
  };
}
