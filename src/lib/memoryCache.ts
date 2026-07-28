/** Cache em memória com stale-while-revalidate (troca rápida de módulo/aba). */

type CacheEntry<T> = {
  at: number;
  data: T;
};

export type MemoryCache<T> = {
  peek: () => T | null;
  isFresh: () => boolean;
  set: (data: T) => void;
  clear: () => void;
};

export function createMemoryCache<T>(ttlMs = 2 * 60 * 1000): MemoryCache<T> {
  let entry: CacheEntry<T> | null = null;

  return {
    peek() {
      return entry?.data ?? null;
    },
    isFresh() {
      return Boolean(entry && Date.now() - entry.at < ttlMs);
    },
    set(data: T) {
      entry = { at: Date.now(), data };
    },
    clear() {
      entry = null;
    },
  };
}
