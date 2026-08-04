import { useCallback, useEffect, useState } from "react";

import type { Dimension } from "@/api/finance";
import {
  fetchDimensionsCached,
  invalidateDimensionsCache,
} from "@/api/finance/dimensionsCache";

export function useDimensions(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async (force = false) => {
    try {
      setLoading(true);
      setError(null);
      if (force) invalidateDimensionsCache();
      const data = await fetchDimensionsCached({ force });
      setDimensions(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar categorias."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refetch(false);
  }, [enabled, refetch]);

  return {
    dimensions,
    loading,
    error,
    refetch: () => refetch(true),
  };
}
