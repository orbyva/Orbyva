import { useCallback, useEffect, useState } from "react";

import { fetchDimensions, type Dimension } from "@/api/finance";

export function useDimensions() {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
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
    refetch();
  }, [refetch]);

  return { dimensions, loading, error, refetch };
}
