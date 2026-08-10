import { useEffect, useState } from "react";

export type GeoBias = { lat: number; lng: number };

/**
 * Uma leitura de geolocation para reutilizar em vários PlaceCatalogSearch
 * (evita getCurrentPosition duplicado no mesmo diálogo).
 */
export function useUserLocationBias(enabled = true): {
  bias: GeoBias | null;
  denied: boolean;
} {
  const [bias, setBias] = useState<GeoBias | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) {
      setDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBias({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setDenied(false);
      },
      () => setDenied(true),
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 }
    );
  }, [enabled]);

  return { bias, denied };
}
