import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Loader2, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TravelModeIcon } from "@/components/TravelModeIcon";
import {
  describeRouteInsight,
  isScheduledTimePast,
  findLastCompletedVisit,
  findNextPendingVisit,
  findPreviousVisit,
  isPastDay,
  resolveRouteOrigin,
  shouldComputeRoutesForDay,
  visitHasCoordinates,
  type RouteInsightTone,
  type VisitLike,
} from "@/domain/itinerary/visits";
import {
  PREFERRED_TRAVEL_MODES,
  TRAVEL_MODES,
  travelModeMeta,
  type TravelModeKey,
} from "@/domain/itinerary/travelModes";
import {
  MapsQuotaExceededError,
  RoutesNotConfiguredError,
  clearRouteCache,
  fetchTravelRoutes,
  type RouteLegResult,
} from "@/lib/googleRoutes";
import { formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Props = {
  dayDate: string | null | undefined;
  visits: VisitLike[];
  tripOrigin?: { lat: number; lng: number } | null;
  originLabel?: string | null;
  refreshKey?: number;
  /** Viagem encerrada: não calcula deslocamento. */
  disabled?: boolean;
};

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowMinutesLocal(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Tons em `-700`/`dark:-400`: mesmo padrão de contraste do resto do app. */
const TONE_CLASS: Record<RouteInsightTone, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  tight: "text-amber-700 dark:text-amber-400",
  late: "text-rose-700 dark:text-rose-400",
};

function fastestAvailableMode(routes: RouteLegResult[]): string | null {
  let fastest: { mode: string; seconds: number } | null = null;
  for (const route of routes) {
    if (!route.available || route.durationSeconds == null) continue;
    if (!fastest || route.durationSeconds < fastest.seconds) {
      fastest = { mode: route.mode, seconds: route.durationSeconds };
    }
  }
  return fastest?.mode ?? null;
}

export function ItineraryNextRoutePanel({
  dayDate,
  visits,
  tripOrigin,
  originLabel,
  refreshKey = 0,
  disabled = false,
}: Props) {
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [routes, setRoutes] = useState<RouteLegResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [manualTick, setManualTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const todayIso = todayIsoLocal();
  const dayIsPast = disabled || isPastDay({ dayDate, todayIso });
  const canCompute =
    !dayIsPast && shouldComputeRoutesForDay({ dayDate, todayIso });

  const nextVisit = useMemo(() => findNextPendingVisit(visits), [visits]);

  const originVisit = useMemo(() => {
    if (!nextVisit) return null;
    return (
      findLastCompletedVisit(visits) ??
      findPreviousVisit(visits, nextVisit.id)
    );
  }, [visits, nextVisit]);

  const fromLabel =
    (userLocation ? "sua localização" : null) ||
    originVisit?.title ||
    originLabel?.trim() ||
    "origem do roteiro";

  const modes: TravelModeKey[] = showAll
    ? TRAVEL_MODES.map((m) => m.mode)
    : PREFERRED_TRAVEL_MODES;

  useEffect(() => {
    if (!canCompute || !nextVisit) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    );
  }, [canCompute, nextVisit?.id, refreshKey, manualTick]);

  useEffect(() => {
    if (!canCompute || !nextVisit) {
      setRoutes([]);
      setError(null);
      return;
    }
    if (!visitHasCoordinates(nextVisit)) {
      setRoutes([]);
      setError("Próximo destino sem coordenadas. Vincule um lugar no mapa.");
      return;
    }

    const origin = resolveRouteOrigin({
      userLocation,
      visits,
      nextVisit,
      tripOrigin: tripOrigin ?? null,
    });
    if (!origin) {
      setRoutes([]);
      setError(
        "Sem origem para o trajeto. Autorize a localização ou configure a origem do roteiro."
      );
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    void fetchTravelRoutes({
      origin,
      destination: { lat: nextVisit.lat!, lng: nextVisit.lng! },
      modes,
      signal: controller.signal,
    })
      .then((results) => {
        if (controller.signal.aborted) return;
        setRoutes(results);
        if (results.every((r) => !r.available)) {
          setError("Nenhuma modalidade disponível para este trecho.");
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        if (err instanceof RoutesNotConfiguredError) {
          setError("Cálculo de rotas ainda não configurado.");
        } else if (err instanceof MapsQuotaExceededError) {
          setError(err.message);
        } else {
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível calcular o trajeto."
          );
        }
        setRoutes([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [
    canCompute,
    nextVisit,
    userLocation,
    visits,
    tripOrigin,
    modes.join(","),
    refreshKey,
    manualTick,
  ]);

  if (dayIsPast) return null;

  if (!canCompute) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
        Rotas disponíveis no dia do roteiro
        {dayDate ? ` (${formatDateBR(dayDate)})` : ""}.
      </div>
    );
  }

  if (!nextVisit) {
    return (
      <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
        Todas as visitas do dia foram concluídas ou puladas.
      </div>
    );
  }

  const nowMinutes = nowMinutesLocal();
  const fastestMode = fastestAvailableMode(routes);
  const scheduleMissed = isScheduledTimePast({
    arrivalHHmm: nextVisit.activity_time,
    nowMinutes,
  });

  return (
    <section className="space-y-3 rounded-lg border bg-card/60 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Próximo destino
          </p>
          <p className="truncate text-sm font-semibold">{nextVisit.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {nextVisit.activity_time ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock className="h-3 w-3 shrink-0" />
                {nextVisit.activity_time}
              </span>
            ) : null}
            {scheduleMissed ? (
              <span className="rounded-full bg-rose-500/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-rose-700 dark:text-rose-400">
                horário já passou
              </span>
            ) : null}
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">de {fromLabel}</span>
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={loading}
          onClick={() => {
            clearRouteCache();
            setManualTick((t) => t + 1);
          }}
          aria-label="Atualizar rotas"
          title="Atualizar rotas"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {error ? (
        <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          {error}
        </p>
      ) : null}

      {loading && routes.length === 0 ? (
        <ul className="space-y-1.5">
          {modes.map((mode) => (
            <li
              key={mode}
              className="h-[52px] animate-pulse rounded-md border bg-muted/40"
            />
          ))}
        </ul>
      ) : (
        <ul className="space-y-1.5">
          {routes.map((route) => {
            const meta = travelModeMeta(route.mode);
            const view = describeRouteInsight({
              durationSeconds: route.available ? route.durationSeconds : null,
              arrivalHHmm: nextVisit.activity_time,
              nowMinutes,
            });
            return (
              <li
                key={route.mode}
                className="flex items-center gap-2.5 rounded-md border bg-background/60 px-2.5 py-2"
              >
                <span
                  title={meta.label}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted"
                >
                  <TravelModeIcon mode={route.mode} />
                </span>

                {view ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium tabular-nums">
                        {view.duration}
                        {route.mode === fastestMode && routes.length > 1 ? (
                          <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-primary">
                            mais rápido
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {view.leaveLabel ?? meta.label}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {view.etaHHmm ? (
                        <p className="text-sm font-medium tabular-nums">
                          <span className="text-xs font-normal text-muted-foreground">
                            chega{" "}
                          </span>
                          {view.etaHHmm}
                        </p>
                      ) : null}
                      {view.status ? (
                        <p className={cn("text-xs", TONE_CLASS[view.status.tone])}>
                          {view.status.label}
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted-foreground">Indisponível</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {meta.label}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!showAll ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full text-xs text-muted-foreground"
          onClick={() => setShowAll(true)}
        >
          Ver todas as opções
        </Button>
      ) : null}
    </section>
  );
}
