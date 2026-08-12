import { useCallback, useEffect, useState } from "react";

import type { Dimension } from "@/api/finance";
import {
  clearDimensionsCache,
  fetchDimensionsCached,
  invalidateDimensionsCache,
  onDimensionsCacheInvalidated,
} from "@/api/finance/dimensionsCache";

export function useDimensions(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { quiet?: boolean; force?: boolean }) => {
    const quiet = opts?.quiet === true;
    const force = opts?.force === true;
    try {
      if (!quiet) setLoading(true);
      setError(null);
      if (force) clearDimensionsCache();
      const data = await fetchDimensionsCached({ force });
      setDimensions(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar categorias."
      );
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
    // Cache já foi limpo por invalidateDimensionsCache, sem force para
    // aproveitar coalesce de inflight entre vários hooks montados.
    return onDimensionsCacheInvalidated(() => {
      void load({ quiet: true });
    });
  }, [enabled, load]);

  return {
    dimensions,
    loading,
    error,
    refetch: () => {
      invalidateDimensionsCache();
    },
  };
}
