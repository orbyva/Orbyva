import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TravelModeIcon } from "@/components/TravelModeIcon";
import {
  buildDelayInsight,
  findLastCompletedVisit,
  findNextPendingVisit,
  findPreviousVisit,
  formatDurationFriendly,
  resolveRouteOrigin,
  shouldComputeRoutesForDay,
  visitHasCoordinates,
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
import { cn } from "@/lib/utils";

type Props = {
  dayDate: string | null | undefined;
  visits: VisitLike[];
  tripOrigin?: { lat: number; lng: number } | null;
  originLabel?: string | null;
  refreshKey?: number;
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

function formatInsightLine(
  route: RouteLegResult,
  arrivalHHmm: string | null | undefined
): string | null {
  if (!route.available || route.durationSeconds == null) return null;
  const duration = formatDurationFriendly(route.durationSeconds);
  if (!arrivalHHmm) return duration;

  const insight = buildDelayInsight({
    arrivalHHmm,
    durationSeconds: route.durationSeconds,
    nowMinutes: nowMinutesLocal(),
  });
  if (!insight) return duration;

  if (insight.kind === "on_time") {
    return `Saia às ${insight.leaveByHHmm} · ${duration} · chegada ${insight.etaHHmm}`;
  }
  if (insight.kind === "leave_now_ok") {
    return `Saia agora · ${duration} · chegada estimada ${insight.etaHHmm}`;
  }
  return `Saia agora · atraso estimado de ${insight.delayMinutes} min · chegada ${insight.etaHHmm}`;
}

export function ItineraryNextRoutePanel({
  dayDate,
  visits,
  tripOrigin,
  originLabel,
  refreshKey = 0,
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

  const canCompute = shouldComputeRoutesForDay({
    dayDate,
    todayIso: todayIsoLocal(),
  });

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

  if (!canCompute) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
        Rotas disponíveis no dia do roteiro
        {dayDate ? ` (${dayDate.slice(0, 10)})` : ""}.
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

  return (
    <section className="space-y-2.5 rounded-lg border bg-card/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Próximo destino
          </p>
          <p className="text-sm font-semibold">
            {nextVisit.title}
            {nextVisit.activity_time ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {nextVisit.activity_time}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">Saindo de {fromLabel}</p>
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
        <p className="text-xs text-amber-700 dark:text-amber-400">{error}</p>
      ) : null}

      <ul className="space-y-1.5">
        {routes.map((route) => {
          const meta = travelModeMeta(route.mode);
          const line = formatInsightLine(route, nextVisit.activity_time);
          return (
            <li key={route.mode} className="flex items-start gap-2.5 text-sm">
              <span title={meta.label} className="mt-0.5">
                <TravelModeIcon mode={route.mode} />
              </span>
              <span
                className={cn(
                  "min-w-0 leading-snug",
                  (!route.available || !line) && "text-muted-foreground"
                )}
              >
                {route.available && line ? line : "Indisponível"}
              </span>
            </li>
          );
        })}
      </ul>

      {!showAll ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowAll(true)}
        >
          Ver todas as opções
        </Button>
      ) : null}
    </section>
  );
}
