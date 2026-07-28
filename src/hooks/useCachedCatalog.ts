import { useCallback, useEffect, useState } from "react";
import type { MemoryCache } from "@/lib/memoryCache";

/**
 * Catálogo com cache em memória: hidrata na hora ao voltar no módulo
 * e revalida em background quando o TTL expirou.
 */
export function useCachedCatalog<T>(
  cache: MemoryCache<T[]>,
  fetcher: () => Promise<T[]>
) {
  const [items, setItems] = useState<T[]>(() => cache.peek() ?? []);
  const [loading, setLoading] = useState(() => cache.peek() === null);

  const reload = useCallback(
    async (force = false) => {
      if (!force && cache.isFresh()) {
        const cached = cache.peek();
        if (cached) {
          setItems(cached);
          setLoading(false);
          return cached;
        }
      }

      try {
        const data = await fetcher();
        cache.set(data);
        setItems(data);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [cache, fetcher]
  );

  const replace = useCallback(
    (updater: (prev: T[]) => T[]) => {
      setItems((prev) => {
        const next = updater(prev);
        cache.set(next);
        return next;
      });
    },
    [cache]
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, loading, reload, replace };
}
