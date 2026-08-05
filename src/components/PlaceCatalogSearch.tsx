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
  GeoapifyNotConfiguredError,
  MapsQuotaExceededError,
  formatDistanceMeters,
  mapGeoapifyCategoryToPlaceType,
  searchPlaces,
  type PlaceSearchHit,
} from "@/lib/geoapifyPlaces";
import type { PlaceType } from "@/types/places";
import { PLACE_TYPE_LABELS } from "@/domain/places";
import { cn } from "@/lib/utils";

export type PlaceCatalogPick = {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  geoapify_place_id: string;
  type: PlaceType;
  category: string | null;
  distanceMeters: number | null;
};

type PlaceCatalogSearchProps = {
  onPick: (place: PlaceCatalogPick) => void;
  /** Local já escolhido — exibido no input até limpar ou buscar de novo. */
  selectedLabel?: string | null;
  onClear?: () => void;
  bias?: { lat: number; lng: number } | null;
  className?: string;
  requestUserLocation?: boolean;
  label?: string;
};

export function PlaceCatalogSearch({
  onPick,
  selectedLabel = null,
  onClear,
  bias: biasProp,
  className,
  requestUserLocation = true,
  label = "Buscar local",
}: PlaceCatalogSearchProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [userBias, setUserBias] = useState<{ lat: number; lng: number } | null>(
    null
  );
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
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 }
    );
  }, [requestUserLocation, biasProp]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setError(null);
      setLoading(false);
      setOpen(false);
      return;
    }

    const id = ++reqId.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setOpen(true);
      void searchPlaces({
        query: q,
        lat: bias?.lat,
        lng: bias?.lng,
      })
        .then((results) => {
          if (reqId.current !== id) return;
          setHits(results);
          setError(null);
        })
        .catch((err) => {
          if (reqId.current !== id) return;
          setHits([]);
          if (err instanceof GeoapifyNotConfiguredError) {
            setError("Busca de mapas ainda não configurada.");
          } else if (err instanceof MapsQuotaExceededError) {
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
    }, 320);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bias só na hora da busca; evita refetch ao GPS chegar
  }, [query]);

  function clearAll() {
    setQuery("");
    setHits([]);
    setError(null);
    setLoading(false);
    setOpen(false);
    onClear?.();
  }

  function pick(hit: PlaceSearchHit) {
    onPick({
      name: hit.name,
      address: hit.address,
      lat: hit.lat,
      lng: hit.lng,
      geoapify_place_id: hit.placeId,
      type: mapGeoapifyCategoryToPlaceType(hit.category),
      category: hit.category,
      distanceMeters: hit.distanceMeters,
    });
    setQuery("");
    setHits([]);
    setLoading(false);
    setOpen(false);
  }

  const showMenu = open && query.trim().length >= 2;
  const showClear = Boolean(query || selectedLabel);

  return (
    <div className={cn("space-y-2", className)}>
      <FormLabel optional>{label}</FormLabel>
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
                if (hits.length > 0 || error || loading) setOpen(true);
              }}
              placeholder="Ex: Mané Garrincha"
              className={cn(
                "pl-9",
                showClear || loading ? "pr-16" : "pr-9",
                showingSelected && "font-medium"
              )}
              autoComplete="off"
            />
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
              {loading ? (
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
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              Buscando…
            </div>
          ) : error ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">{error}</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Nenhum lugar encontrado
            </p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {hits.map((hit) => {
                const dist = formatDistanceMeters(hit.distanceMeters);
                const typeLabel =
                  PLACE_TYPE_LABELS[
                    mapGeoapifyCategoryToPlaceType(hit.category)
                  ] ?? hit.category;
                return (
                  <li key={hit.placeId}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(hit);
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
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {[typeLabel, dist].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
