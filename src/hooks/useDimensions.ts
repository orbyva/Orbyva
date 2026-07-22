import { useCallback, useEffect, useState } from "react";

import { fetchDimensions, type Dimension } from "@/api/finance";

export function useDimensions(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchDimensions();
      setDimensions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dimensões.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refetch();
  }, [enabled, refetch]);

  return { dimensions, loading, error, refetch };
}
