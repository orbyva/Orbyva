import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/FormLabel";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  DestinationNotFoundError,
  MapsQuotaExceededError,
  PlacesNotConfiguredError,
  formatDistanceMeters,
  mapPlaceCategoryToPlaceType,
  resolvePlaceLocation,
  searchPlaces,
  type PlaceSearchHit,
} from "@/lib/googlePlaces";
import type { PlaceType } from "@/types/places";
import { PLACE_TYPE_LABELS } from "@/domain/places";
import { cn } from "@/lib/utils";

export type PlaceCatalogPick = {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  google_place_id: string;
  type: PlaceType;
  category: string | null;
  distanceMeters: number | null;
};

type PlaceCatalogSearchProps = {
  onPick: (place: PlaceCatalogPick) => void;
  selectedLabel?: string | null;
  onClear?: () => void;
  bias?: { lat: number; lng: number } | null;
  className?: string;
  requestUserLocation?: boolean;
  label?: string;
  /** Destino de viagem: só país / estado / cidade. */
  scope?: "all" | "regions";
  placeholder?: string;
  required?: boolean;
};

function isSearchAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

export function PlaceCatalogSearch({
  onPick,
  selectedLabel = null,
  onClear,
  bias: biasProp,
  className,
  requestUserLocation = true,
  label = "Buscar local",
  scope = "all",
  placeholder,
  required = false,
}: PlaceCatalogSearchProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [userBias, setUserBias] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [locationDenied, setLocationDenied] = useState(false);
  const reqId = useRef(0);
  const bias = biasProp ?? userBias;
  const showingSelected = Boolean(selectedLabel) && query === "";

  useEffect(() => {
    if (!requestUserLocation || biasProp) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserBias({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocationDenied(false);
      },
      () => {
        setLocationDenied(true);
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 }
    );
  }, [requestUserLocation, biasProp]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      reqId.current += 1;
      setHits([]);
      setError(null);
      setLoading(false);
      setOpen(false);
      return;
    }

    const id = ++reqId.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setOpen(true);
      void searchPlaces({
        query: q,
        lat: bias?.lat,
        lng: bias?.lng,
        scope,
        signal: controller.signal,
      })
        .then((results) => {
          if (reqId.current !== id) return;
          setHits(results);
          setError(
            results.length === 0 ? "Destino não encontrado" : null
          );
        })
        .catch((err) => {
          if (reqId.current !== id) return;
          if (isSearchAbortError(err) || controller.signal.aborted) return;
          setHits([]);
          if (err instanceof PlacesNotConfiguredError) {
            setError("Busca de mapas ainda não configurada.");
          } else if (err instanceof MapsQuotaExceededError) {
            setError(err.message);
          } else if (err instanceof DestinationNotFoundError) {
            setError(err.message);
          } else {
            setError(
              err instanceof Error
                ? err.message
                : "Não foi possível buscar lugares."
            );
          }
        })
        .finally(() => {
          if (reqId.current === id) setLoading(false);
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bias só na hora da busca
  }, [query, scope]);

  function clearAll() {
    setQuery("");
    setHits([]);
    setError(null);
    setLoading(false);
    setOpen(false);
    onClear?.();
  }

  async function pick(hit: PlaceSearchHit) {
    setResolving(true);
    setError(null);
    try {
      let lat = hit.lat;
      let lng = hit.lng;
      let placeId = hit.placeId;

      if (lat == null || lng == null) {
        const coords = await resolvePlaceLocation({
          placeId: hit.placeId,
        });
        lat = coords.lat;
        lng = coords.lng;
        placeId = coords.placeId;
      }

      onPick({
        name: hit.name,
        address: hit.address,
        lat,
        lng,
        google_place_id: placeId,
        type: mapPlaceCategoryToPlaceType(hit.category),
        category: hit.category,
        distanceMeters: hit.distanceMeters,
      });
      setQuery("");
      setHits([]);
      setOpen(false);
    } catch (err) {
      if (err instanceof MapsQuotaExceededError) {
        setError(err.message);
      } else if (err instanceof DestinationNotFoundError) {
        setError(err.message);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível confirmar o destino."
        );
      }
      setOpen(true);
    } finally {
      setResolving(false);
    }
  }

  const showMenu = open && query.trim().length >= 2;
  const showClear = Boolean(query || selectedLabel);
  const busy = loading || resolving;

  return (
    <div className={cn("space-y-2", className)}>
      <FormLabel required={required} optional={!required}>
        {label}
      </FormLabel>
      {locationDenied && !biasProp ? (
        <p className="text-xs text-muted-foreground">
          Localização negada — a busca funciona, mas sem priorizar lugares
          próximos.
        </p>
      ) : null}
      <Popover
        open={showMenu}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
        modal={false}
      >
        <PopoverAnchor asChild>
          <div className="relative">
            {showingSelected ? (
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            ) : (
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              value={showingSelected ? selectedLabel! : query}
              onChange={(e) => {
                const next = e.target.value;
                if (selectedLabel) onClear?.();
                setQuery(next);
              }}
              onFocus={() => {
                if (hits.length > 0 || error || busy) setOpen(true);
              }}
              placeholder={
                placeholder ??
                (scope === "regions"
                  ? "Ex: Madrid, Espanha"
                  : "Ex: Mané Garrincha")
              }
              className={cn(
                "pl-9",
                showClear || busy ? "pr-16" : "pr-9",
                showingSelected && "font-medium"
              )}
              autoComplete="off"
              disabled={resolving}
            />
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
              {busy ? (
                <Loader2
                  className="mx-1.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden
                />
              ) : null}
              {showClear ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={clearAll}
                  aria-label={selectedLabel ? "Remover local" : "Limpar busca"}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="w-[var(--radix-popover-trigger-width)] max-h-56 overflow-y-auto overscroll-contain p-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {busy ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              {resolving ? "Confirmando destino…" : "Buscando…"}
            </div>
          ) : error ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">{error}</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Destino não encontrado
            </p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {hits.map((hit) => {
                const dist = formatDistanceMeters(hit.distanceMeters);
                const mappedType = mapPlaceCategoryToPlaceType(hit.category);
                const typeLabel =
                  mappedType === "other"
                    ? null
                    : PLACE_TYPE_LABELS[mappedType];
                return (
                  <li key={hit.placeId}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        void pick(hit);
                      }}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {hit.name}
                        </span>
                        {hit.address ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {hit.address}
                          </span>
                        ) : null}
                        {typeLabel || dist ? (
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {[typeLabel, dist].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t px-2 py-1.5 text-[10px] text-muted-foreground">
            Powered by Google
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
