import * as Location from "expo-location";
import { useEffect, useState } from "react";

export type GeoBias = { lat: number; lng: number };

/**
 * Uma leitura de GPS para enviesar a busca do Google Places.
 * Recusar a permissão não quebra a busca — só não prioriza “perto de mim”.
 */
export function useUserLocationBias(enabled = true): {
  bias: GeoBias | null;
  denied: boolean;
} {
  const [bias, setBias] = useState<GeoBias | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!cancelled) setDenied(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (cancelled) return;
      setBias({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
      setDenied(false);
    })().catch(() => {
      if (!cancelled) setDenied(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { bias, denied };
}
