import { useEffect, useMemo, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import {
  CalendarCheck,
  CalendarDays,
  Check,
  Clock,
  ExternalLink,
  Flag,
  GripVertical,
  Loader2,
  MapPin,
  Minus,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plane,
  Plus,
  SkipForward,
  Star,
  Trash2,
  Undo2,
} from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/EmptyState";
import { PlaceTypeIcon } from "@/components/PlaceTypeIcon";
import { ItineraryDayWeather } from "@/components/TripWeatherPanels";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import {
  deleteItineraryActivity,
  setItineraryVisitStatus,
} from "@/api/travel";
import {
  normalizeAvatarUrl,
  avatarFromUserMeta,
  googleAvatarColor,
  googleAvatarInitial,
} from "@/lib/avatar";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { formatLocalIsoDate } from "@/lib/dates";
import { dropZoneAttrs, readDropZone } from "@/lib/dropZone";
import { LIST_LAYOUT_TRANSITION } from "@/lib/layoutMotion";
import { useTouchDrag } from "@/hooks/useTouchDrag";
import { cn } from "@/lib/utils";
import {
  describeDayOffset,
  formatWeekdayShortBR,
  normalizeVisitStatus,
  sortVisitsForDay,
  summarizeDayVisits,
  type VisitLike,
} from "@/domain/itinerary/visits";
import {
  ACTIVITY_CATEGORY_LABELS,
  normalizeTripActivityCategory,
} from "@/domain/travel";
import {
  isTransportActivity,
} from "@/domain/travel/interDayTransfers";
import {
  TRIP_TRANSPORT_MODE_LABELS,
  normalizeTripTransportMode,
  transportModeHasBoarding,
} from "@/domain/travel/transportModes";
import { formatRating, isGoogleMapsUrl, placeTypeMeta } from "@/domain/places";
import type { TripMember } from "@/types/tripSharing";
import type { PlaceType } from "@/types/places";
import type { PlaceVisit } from "@/types/places";
import type {
  TripItineraryActivity,
  TripItineraryDay,
  TripStop,
} from "@/types/travel";
import { ItineraryNextRoutePanel } from "./ItineraryNextRoutePanel";
import { stopForDate } from "@/domain/travel/tripStops";
import {
  collectItineraryPlaceIds,
  suggestionAnchorForDay,
  suggestionsForAnchor,
  type GeoAnchor,
} from "@/domain/travel/savedPlaceSuggestions";
import {
  persistDismissedSuggestionCity,
  readDismissedSuggestionCities,
} from "@/lib/savedPlaceSuggestionDismiss";
import {
  ItinerarySavedPlaceSuggestions,
  parseSavedPlaceDragId,
  savedPlaceDragId,
} from "./ItinerarySavedPlaceSuggestions";
type TripItineraryTabProps = {
  tripId: string;
  itinerary: TripItineraryDay[];
  places: PlaceVisit[];
  savedPlaces?: PlaceVisit[];
  members: TripMember[];
  user: User | null;
  tripOrigin?: { lat: number; lng: number } | null;
  originLabel?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationName?: string | null;
  destinationPlaceId?: string | null;
  stops?: TripStop[];
  /** Desativa somente o cálculo de deslocamentos. */
  disableRoutes?: boolean;
  onEditDay: (day: TripItineraryDay) => void;
  onEditActivity: (act: TripItineraryActivity) => void;
  /** Abre os assets (arquivos e links) da linha — vale igual para evento e deslocamento. */
  onOpenAssets: (act: TripItineraryActivity) => void;
  onAddActivity: (dayId: string) => void;
  /** Deslocamento como atividade do dia. */
  onAddTransfer?: (dayId: string) => void;
  hasRoundTrip?: boolean;
  onManageRoundTrip?: () => void;
  onReload: () => void;
  onVisitStatusChange: (
    actId: string,
    status: "pending" | "completed" | "skipped"
  ) => void;
  /** Antes de concluir: permite abrir avaliação. Retorne false para cancelar o status. */
  onBeforeCompleteVisit?: (act: TripItineraryActivity) => boolean | void;
  /** Remove atividade do estado local (evita refetch do bundle). */
  onActivityDeleted?: (actId: string) => void;
  onMoveVisit: (
    actId: string,
    targetDayId: string,
    targetIndex: number
  ) => void;
  onAddSavedPlace: (place: PlaceVisit, dayId: string) => void | Promise<void>;
};

type TimedMoveAttempt = {
  title: string;
  activityTime: string;
};

/** `visit|<dayId>|<índice de inserção>` */
const VISIT_ZONE = "visit";

type DragHandleProps = (
  itemId: string,
  label: string
) => Record<string, unknown>;

function enrichVisits(
  day: TripItineraryDay,
  places: PlaceVisit[]
): VisitLike[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  return (day.activities ?? []).map((act) => {
    const place = act.place_visit_id
      ? byId.get(act.place_visit_id)
      : undefined;
    const isTransfer = isTransportActivity(act);
    return {
      id: act.id,
      title: act.title,
      activity_time: act.activity_time
        ? String(act.activity_time).slice(0, 5)
        : act.activity_time,
      arrival_time: act.arrival_time
        ? String(act.arrival_time).slice(0, 5)
        : act.arrival_time,
      sort_order: act.sort_order,
      place_visit_id: act.place_visit_id,
      visit_status: act.visit_status,
      completed_at: act.completed_at,
      skipped_at: act.skipped_at,
      category: act.category,
      lat: isTransfer
        ? (act.destination_lat ?? null)
        : (place?.lat ?? null),
      lng: isTransfer
        ? (act.destination_lng ?? null)
        : (place?.lng ?? null),
      google_place_id: isTransfer
        ? (act.destination_place_id ?? null)
        : (place?.google_place_id ?? null),
      day_date: day.date ?? null,
    };
  });
}

function formatCompletedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function TripItineraryTab({
  tripId,
  itinerary,
  places,
  savedPlaces = [],
  members,
  user,
  tripOrigin,
  originLabel,
  destinationLat,
  destinationLng,
  destinationName,
  destinationPlaceId,
  stops = [],
  disableRoutes = false,
  onEditDay,
  onEditActivity,
  onOpenAssets,
  onAddActivity,
  onAddTransfer,
  hasRoundTrip = false,
  onManageRoundTrip,
  onReload,
  onVisitStatusChange,
  onActivityDeleted,
  onBeforeCompleteVisit,
  onMoveVisit,
  onAddSavedPlace,
}: TripItineraryTabProps) {
  const [routeRefresh, setRouteRefresh] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragVisitId, setDragVisitId] = useState<string | null>(null);
  const [dropDayId, setDropDayId] = useState<string | null>(null);
  const [showPastDays, setShowPastDays] = useState(false);
  const [timedMoveAttempt, setTimedMoveAttempt] =
    useState<TimedMoveAttempt | null>(null);
  const [dismissedCities, setDismissedCities] = useState<GeoAnchor[]>([]);
  const [addingPlaceId, setAddingPlaceId] = useState<string | null>(null);

  useEffect(() => {
    setDismissedCities(readDismissedSuggestionCities(tripId));
  }, [tripId]);

  const todayIso = formatLocalIsoDate(new Date());
  const itineraryPlaceIds = useMemo(
    () => collectItineraryPlaceIds(itinerary),
    [itinerary]
  );
  const destinationFallback = useMemo(
    () =>
      destinationLat != null && destinationLng != null
        ? {
            name: destinationName ?? "",
            lat: destinationLat,
            lng: destinationLng,
            place_id: destinationPlaceId ?? null,
          }
        : null,
    [destinationLat, destinationLng, destinationName, destinationPlaceId]
  );

  const { handleProps: dragHandleProps, dragOverlay } = useTouchDrag({
    onStart: setDragVisitId,
    onZoneChange: (zone) => {
      const target = readDropZone(zone);
      setDropDayId(target?.kind === VISIT_ZONE ? target.parts[0] : null);
    },
    onDrop: (visitId, zone) => {
      const target = readDropZone(zone);
      if (target?.kind !== VISIT_ZONE) return;
      handleDrop(target.parts[0], Number(target.parts[1]), visitId);
    },
    onCancel: () => {
      setDragVisitId(null);
      setDropDayId(null);
    },
  });

  async function setStatus(
    actId: string,
    status: "pending" | "completed" | "skipped",
    act?: TripItineraryActivity
  ) {
    if (status === "completed" && act && onBeforeCompleteVisit) {
      const ok = onBeforeCompleteVisit(act);
      if (ok === false) return;
    }
    onVisitStatusChange(actId, status);
    setRouteRefresh((n) => n + 1);
    setBusyId(actId);
    try {
      await setItineraryVisitStatus(actId, status);
    } catch {
      onReload();
    } finally {
      setBusyId(null);
    }
  }

  function handleDrop(
    targetDayId: string,
    targetIndex: number,
    visitId = dragVisitId
  ) {
    if (!visitId) return;
    const savedId = parseSavedPlaceDragId(visitId);
    if (savedId) {
      const place =
        savedPlaces.find((item) => item.id === savedId) ??
        places.find((item) => item.id === savedId);
      setDragVisitId(null);
      setDropDayId(null);
      if (place) onAddSavedPlace(place, targetDayId);
      return;
    }
    const fromDay = itinerary.find((d) =>
      (d.activities ?? []).some((a) => a.id === visitId)
    );
    const targetDay = itinerary.find((day) => day.id === targetDayId);
    const moving = fromDay?.activities?.find((a) => a.id === visitId);
    setDragVisitId(null);
    setDropDayId(null);
    if (!fromDay || !targetDay || !moving) return;

    const orderedTarget = sortVisitsForDay(targetDay.activities ?? []);
    const originalIndex = orderedTarget.findIndex((a) => a.id === visitId);
    const withoutMoving = orderedTarget.filter((a) => a.id !== visitId);
    const adjustedIndex =
      fromDay.id === targetDayId &&
      originalIndex >= 0 &&
      originalIndex < targetIndex
        ? targetIndex - 1
        : targetIndex;
    const baseInsertionIndex = Math.max(
      0,
      Math.min(adjustedIndex, withoutMoving.length)
    );
    const firstUntimedIndex = withoutMoving.findIndex(
      (activity) => !activity.activity_time
    );
    const minimumUntimedIndex =
      firstUntimedIndex < 0 ? withoutMoving.length : firstUntimedIndex;
    const insertionIndex = moving.activity_time
      ? baseInsertionIndex
      : Math.max(minimumUntimedIndex, baseInsertionIndex);
    const reordered = [...withoutMoving];
    reordered.splice(insertionIndex, 0, moving);

    if (
      fromDay.id === targetDayId &&
      reordered.every((activity, index) => activity.id === orderedTarget[index]?.id)
    ) {
      return;
    }

    if (fromDay.id === targetDayId && moving.activity_time) {
      setTimedMoveAttempt({
        title: moving.title,
        activityTime: moving.activity_time,
      });
      return;
    }

    onMoveVisit(moving.id, targetDayId, insertionIndex);
    setRouteRefresh((n) => n + 1);
  }

  async function addSavedPlace(place: PlaceVisit, dayId: string) {
    setAddingPlaceId(place.id);
    try {
      await onAddSavedPlace(place, dayId);
    } finally {
      setAddingPlaceId(null);
    }
  }

  function dismissCity(city: GeoAnchor) {
    setDismissedCities(persistDismissedSuggestionCity(tripId, city));
  }

  const showDragHint =
    itinerary.length > 1 ||
    itinerary.some((day) => (day.activities?.length ?? 0) > 1);

  const pastDayCount = useMemo(
    () =>
      itinerary.filter(
        (day) =>
          describeDayOffset({ dayDate: day.date, todayIso }).kind === "past"
      ).length,
    [itinerary, todayIso]
  );

  const visibleDays = useMemo(() => {
    if (showPastDays) return itinerary;
    return itinerary.filter(
      (day) =>
        describeDayOffset({ dayDate: day.date, todayIso }).kind !== "past"
    );
  }, [itinerary, showPastDays, todayIso]);

  return (
    <TabsContent value="itinerary" className="mt-4 space-y-3">
      {onManageRoundTrip ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onManageRoundTrip}
          >
            <Plane className="h-3.5 w-3.5" />
            {hasRoundTrip ? "Editar ida e volta" : "Adicionar ida e volta"}
          </Button>
        </div>
      ) : null}

      {disableRoutes ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 dark:border-amber-400/20 dark:bg-amber-500/15">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 dark:bg-amber-400/20"
            aria-hidden
          >
            <Flag className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Viagem encerrada
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/75">
              Você ainda pode editar o roteiro; o cálculo de deslocamentos fica
              pausado.
            </p>
          </div>
        </div>
      ) : null}

      {showDragHint ? (
        <p className="text-xs text-muted-foreground">
          Arraste por{" "}
          <GripVertical className="inline h-3 w-3 align-text-bottom" /> para
          mudar a ordem ou o dia. Eventos com horário mudam de dia, mas a ordem
          no dia segue o relógio.
        </p>
      ) : null}

      {pastDayCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => setShowPastDays((v) => !v)}
        >
          <CalendarCheck className="mr-1.5 h-3.5 w-3.5" />
          {showPastDays
            ? "Ocultar dias anteriores"
            : `Ver dias anteriores (${pastDayCount})`}
        </Button>
      ) : null}

      {itinerary.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Roteiro sem dias"
          description="Defina as datas de início e fim da viagem para gerar os dias do roteiro."
          className="rounded-xl border border-dashed bg-card/50 py-12"
        />
      ) : null}

      <LayoutGroup id="trip-itinerary-visits">
        {visibleDays.map((day) => (
          <DayBlock
            key={day.id}
            day={day}
            tripId={tripId}
            places={places}
            savedPlaces={savedPlaces}
            itineraryPlaceIds={itineraryPlaceIds}
            dismissedCities={dismissedCities}
            destinationFallback={destinationFallback}
            addingPlaceId={addingPlaceId}
            members={members}
            user={user}
            todayIso={todayIso}
            tripOrigin={tripOrigin}
            originLabel={originLabel}
            destinationLat={destinationLat}
            destinationLng={destinationLng}
            stops={stops}
            routeRefresh={routeRefresh}
            busyId={busyId}
            disableRoutes={disableRoutes}
            dragVisitId={dragVisitId}
            isDropTarget={dropDayId === day.id && dragVisitId != null}
            onEditDay={onEditDay}
            onEditActivity={onEditActivity}
            onOpenAssets={onOpenAssets}
            onAddActivity={onAddActivity}
            onAddTransfer={onAddTransfer}
          onReload={onReload}
          onActivityDeleted={onActivityDeleted}
          onSetStatus={setStatus}
            dragHandleProps={dragHandleProps}
            onDragVisitStart={setDragVisitId}
            onDragVisitEnd={() => {
              setDragVisitId(null);
              setDropDayId(null);
            }}
            onDragOverDay={() => setDropDayId(day.id)}
            onDragLeaveDay={() =>
              setDropDayId((cur) => (cur === day.id ? null : cur))
            }
            onDropOnDay={() => handleDrop(day.id, day.activities?.length ?? 0)}
            onDropBeforeVisit={(index) => handleDrop(day.id, index)}
            onAddSavedPlace={(place) => void addSavedPlace(place, day.id)}
            onDismissCity={dismissCity}
          />
        ))}
      </LayoutGroup>
      <AlertDialog
        open={timedMoveAttempt != null}
        onOpenChange={(open) => {
          if (!open) setTimedMoveAttempt(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este evento tem horário definido</AlertDialogTitle>
            <AlertDialogDescription>
              “{timedMoveAttempt?.title}” está marcado para{" "}
              {timedMoveAttempt?.activityTime}. Eventos com horário são
              ordenados automaticamente dentro do mesmo dia. Você pode
              movê-lo para outro dia ou remover o horário na edição para
              ordená-lo manualmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setTimedMoveAttempt(null)}
            >
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {dragOverlay}
    </TabsContent>
  );
}

function DayBlock({
  day,
  tripId,
  places,
  savedPlaces,
  itineraryPlaceIds,
  dismissedCities,
  destinationFallback,
  addingPlaceId,
  members,
  user,
  todayIso,
  tripOrigin,
  originLabel,
  destinationLat,
  destinationLng,
  stops = [],
  routeRefresh,
  busyId,
  disableRoutes,
  dragVisitId,
  isDropTarget,
  onEditDay,
  onEditActivity,
  onOpenAssets,
  onAddActivity,
  onAddTransfer,
  onReload,
  onActivityDeleted,
  onSetStatus,
  dragHandleProps,
  onDragVisitStart,
  onDragVisitEnd,
  onDragOverDay,
  onDragLeaveDay,
  onDropOnDay,
  onDropBeforeVisit,
  onAddSavedPlace,
  onDismissCity,
}: {
  day: TripItineraryDay;
  tripId: string;
  places: PlaceVisit[];
  savedPlaces: PlaceVisit[];
  itineraryPlaceIds: ReadonlySet<string>;
  dismissedCities: GeoAnchor[];
  destinationFallback: GeoAnchor | null;
  addingPlaceId: string | null;
  members: TripMember[];
  user: User | null;
  todayIso: string;
  tripOrigin?: { lat: number; lng: number } | null;
  originLabel?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  stops?: TripStop[];
  routeRefresh: number;
  busyId: string | null;
  disableRoutes: boolean;
  dragVisitId: string | null;
  isDropTarget: boolean;
  onEditDay: (day: TripItineraryDay) => void;
  onEditActivity: (act: TripItineraryActivity) => void;
  onOpenAssets: (act: TripItineraryActivity) => void;
  onAddActivity: (dayId: string) => void;
  onAddTransfer?: (dayId: string) => void;
  onReload: () => void;
  onActivityDeleted?: (actId: string) => void;
  onSetStatus: (
    id: string,
    status: "pending" | "completed" | "skipped",
    act?: TripItineraryActivity
  ) => Promise<void>;
  dragHandleProps: DragHandleProps;
  onDragVisitStart: (id: string) => void;
  onDragVisitEnd: () => void;
  onDragOverDay: () => void;
  onDragLeaveDay: () => void;
  onDropOnDay: () => void;
  onDropBeforeVisit: (index: number) => void;
  onAddSavedPlace: (place: PlaceVisit) => void;
  onDismissCity: (city: GeoAnchor) => void;
}) {
  const [deleting, setDeleting] = useState<TripItineraryActivity | null>(null);
  const reduceMotion = useReducedMotion();

  const placeById = useMemo(
    () => new Map(places.map((place) => [place.id, place])),
    [places]
  );
  /** Próximo destino: eventos + deslocamentos (para não priorizar evento antes da chegada). */
  const routeVisits = useMemo(
    () => enrichVisits(day, places),
    [day, places]
  );
  const sortedActs = useMemo(() => {
    return sortVisitsForDay(
      (day.activities ?? []).map((a) => ({
        ...a,
        activity_time: a.activity_time,
        sort_order: a.sort_order,
      }))
    );
  }, [day.activities]);

  const summary = summarizeDayVisits(
    (day.activities ?? []).filter((a) => !isTransportActivity(a))
  );
  const { kind, label: offsetLabel } = describeDayOffset({
    dayDate: day.date,
    todayIso,
  });
  const isToday = kind === "today";
  const weekday = formatWeekdayShortBR(day.date);
  const dayOfMonth = day.date ? day.date.slice(8, 10) : null;
  const dateLabel = day.date ? formatDateBR(day.date) : null;
  const dayTitle = day.title?.trim();
  const stop = day.date ? stopForDate(stops, day.date) : null;
  const stopName = stop?.name?.trim() || null;
  const heading = [dayTitle || `Dia ${day.day_number}`, stopName]
    .filter(Boolean)
    .join(" · ");
  const suggestionAnchor = suggestionAnchorForDay({
    date: day.date,
    stops,
    fallback: destinationFallback,
  });
  const suggestedPlaces = suggestionAnchor
    ? suggestionsForAnchor({
        candidates: [...places, ...savedPlaces],
        anchor: suggestionAnchor,
        tripId,
        itineraryPlaceIds,
        dismissed: dismissedCities,
      })
    : [];

  return (
    <article
      className={cn(
        "relative space-y-3 overflow-hidden rounded-xl border p-3.5 transition-colors sm:p-4",
        isToday &&
          "border-primary/30 bg-card pl-4 shadow-sm ring-1 ring-primary/10 sm:pl-5",
        kind === "past" && "border-border/50 bg-muted/20",
        (kind === "future" || kind === "undated") &&
          "border-border/60 bg-card shadow-sm",
        isDropTarget &&
          "border-primary/60 bg-primary/[0.06] ring-2 ring-primary/20"
      )}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOverDay();
      }}
      onDragLeave={onDragLeaveDay}
      onDrop={(event) => {
        event.preventDefault();
        onDropOnDay();
      }}
      {...dropZoneAttrs(VISIT_ZONE, day.id, sortedActs.length)}
    >
      {isToday ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary"
        />
      ) : null}

      <header className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl",
            isToday
              ? "bg-primary/15 text-primary"
              : kind === "past"
                ? "bg-muted text-muted-foreground/80"
                : "bg-muted text-muted-foreground"
          )}
          aria-hidden
        >
          <span className="text-[9px] font-semibold uppercase leading-none tracking-wide opacity-80">
            {weekday ?? "Dia"}
          </span>
          <span className="text-base font-bold leading-none tabular-nums">
            {dayOfMonth ?? day.day_number}
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3
              className={cn(
                "truncate text-sm font-semibold tracking-tight sm:text-base",
                kind === "past" && "text-muted-foreground"
              )}
            >
              {heading}
            </h3>
            {isToday ? (
              <span className="rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">
                Hoje
              </span>
            ) : offsetLabel ? (
              <span className="text-[11px] text-muted-foreground">
                {offsetLabel}
              </span>
            ) : null}
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            {dateLabel ?? `Dia ${day.day_number}`}
            {dayTitle ? ` · Dia ${day.day_number}` : null}
          </p>
          {day.notes ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {day.notes}
            </p>
          ) : null}

          {summary.total > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={summary.donePct}
                aria-label={`Progresso do dia: ${summary.completed} de ${summary.total} eventos concluídos`}
                className="h-1.5 min-w-[4rem] flex-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-success transition-[width] duration-300 ease-out"
                  style={{ width: `${summary.donePct}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                {summary.completed}/{summary.total}
              </span>
              {summary.skipped > 0 ? (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/80">
                  {summary.skipped === 1
                    ? "1 pulada"
                    : `${summary.skipped} puladas`}
                </span>
              ) : null}
              {summary.pending === 0 ? (
                <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-success">
                  Dia completo
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 shrink-0", ICON_EDIT_BUTTON_CLASS)}
          onClick={() => onEditDay(day)}
          aria-label="Editar dia"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </header>

      {routeVisits.length > 0 ? (
        <ItineraryNextRoutePanel
          dayDate={day.date}
          visits={routeVisits}
          tripOrigin={tripOrigin}
          originLabel={originLabel}
          refreshKey={routeRefresh}
          disabled={disableRoutes}
        />
      ) : null}

      {(() => {
        const stop = day.date ? stopForDate(stops, day.date) : null;
        return (
          <ItineraryDayWeather
            lat={stop?.lat ?? destinationLat}
            lng={stop?.lng ?? destinationLng}
            dayDate={day.date}
            stopLabel={stop?.name ?? null}
          />
        );
      })()}

      {suggestionAnchor && suggestedPlaces.length > 0 ? (
        <ItinerarySavedPlaceSuggestions
          tripId={tripId}
          city={suggestionAnchor}
          places={suggestedPlaces}
          addingPlaceId={addingPlaceId}
          dragHandleProps={dragHandleProps}
          onDragStart={(placeId) =>
            onDragVisitStart(savedPlaceDragId(placeId))
          }
          onDragEnd={onDragVisitEnd}
          onAdd={onAddSavedPlace}
          onDismiss={onDismissCity}
        />
      ) : null}

      {sortedActs.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center">
          <MapPin className="mx-auto mb-2 h-5 w-5 text-primary" aria-hidden />
          <p className="text-sm font-medium">Nada neste dia</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Adicione eventos ou um deslocamento no plano do dia.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {sortedActs.map((act, index) => {
            const isTransfer = isTransportActivity(act);
            const status = normalizeVisitStatus(act.visit_status);
            const category = normalizeTripActivityCategory(act.category);
            const modeLabel = isTransfer
              ? TRIP_TRANSPORT_MODE_LABELS[
                  normalizeTripTransportMode(act.transport_mode)
                ]
              : null;
            const categoryLabel = isTransfer
              ? modeLabel
              : ACTIVITY_CATEGORY_LABELS[category];
            const placeTypeForUi: PlaceType =
              category === "transport" ? "other" : category;
            const categoryTone = placeTypeMeta(placeTypeForUi).tone;
            const arrive = act.arrival_time?.trim() || null;
            // Embarque só existe em deslocamento com portão: em carro o campo não é oferecido, e
            // dado antigo pode ter sobrado se o modo mudou depois — a regra do domínio manda.
            const boarding =
              isTransfer && transportModeHasBoarding(act.transport_mode)
                ? act.boarding_time?.trim() || null
                : null;
            // `?? 0` e não `.length`: `assets` ausente quer dizer "não carregado", e contador
            // nenhum é melhor que um zero que mente.
            const assetCount = act.assets?.length ?? 0;
            const place = act.place_visit_id
              ? placeById.get(act.place_visit_id)
              : undefined;
            const member = members.find(
              (m) => m.user_id === act.created_by_user_id
            );
            const isMine =
              !!user?.id &&
              (act.created_by_user_id === user.id ||
                (!act.created_by_user_id && members.length <= 1));
            const myName =
              (user?.user_metadata?.full_name as string | undefined) ||
              (user?.user_metadata?.name as string | undefined) ||
              user?.email?.split("@")[0] ||
              null;
            const myAvatar = avatarFromUserMeta(
              user?.user_metadata as Record<string, unknown> | undefined
            );
            const authorName =
              act.created_by_name ||
              member?.display_name ||
              (isMine ? myName : null);
            const authorAvatar =
              (isMine ? myAvatar : undefined) ||
              normalizeAvatarUrl(act.created_by_avatar) ||
              normalizeAvatarUrl(member?.avatar_url) ||
              (isMine ? myAvatar : undefined);
            const initial = googleAvatarInitial(authorName);
            const fallbackColor = googleAvatarColor(
              act.created_by_user_id || authorName || user?.id || "user"
            );
            const showAuthor =
              members.length > 1 &&
              (!!act.created_by_user_id || !!authorName || !!authorAvatar);
            const doneAt = formatCompletedAt(act.completed_at);
            const skippedAt = formatCompletedAt(act.skipped_at);
            const busy = busyId === act.id;

            return (
              <motion.li
                key={act.id}
                layout={!reduceMotion ? "position" : false}
                layoutId={!reduceMotion ? `visit-${act.id}` : undefined}
                transition={LIST_LAYOUT_TRANSITION}
                draggable
                aria-busy={busy}
                onDragStart={() => onDragVisitStart(act.id)}
                onDragEnd={onDragVisitEnd}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onDragOverDay();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onDropBeforeVisit(index);
                }}
                {...dropZoneAttrs(VISIT_ZONE, day.id, index)}
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-2 py-1.5 transition-colors sm:px-2.5",
                  isTransfer &&
                    status === "pending" &&
                    "border-sky-500/25 bg-sky-500/[0.04]",
                  !isTransfer &&
                    status === "pending" &&
                    "border-border/70 bg-card",
                  status === "completed" &&
                    "border-success/25 bg-success/[0.06] dark:bg-success/[0.1]",
                  status === "skipped" && "border-border/50 bg-muted/40",
                  dragVisitId === act.id && "border-dashed opacity-50",
                  busy && "cursor-progress"
                )}
              >
                <span
                  {...dragHandleProps(act.id, act.title)}
                  className="-my-1 flex h-10 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:text-foreground active:cursor-grabbing"
                  title={
                    act.activity_time
                      ? "Arrastar para outro dia; a ordem neste dia segue o horário"
                      : "Arrastar para mudar a ordem ou o dia"
                  }
                  aria-hidden
                >
                  <GripVertical className="h-4 w-4" />
                </span>

                {isTransfer ? (
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                    aria-hidden
                  >
                    <Plane className="h-4 w-4" />
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={status === "completed"}
                    aria-label={
                      status === "pending"
                        ? `${act.title}: ${categoryLabel}. Marcar como concluída`
                        : `${act.title}: reabrir evento`
                    }
                    onClick={() =>
                      void onSetStatus(
                        act.id,
                        status === "pending" ? "completed" : "pending",
                        act
                      )
                    }
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all active:scale-95",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      status === "pending" &&
                        cn("border-transparent", categoryTone),
                      status === "completed" &&
                        "border-success bg-success text-success-foreground",
                      status === "skipped" &&
                        "border-dashed border-muted-foreground/40 bg-muted text-muted-foreground"
                    )}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : status === "completed" ? (
                      <Check className="h-4 w-4" />
                    ) : status === "skipped" ? (
                      <Minus className="h-3.5 w-3.5" />
                    ) : (
                      <PlaceTypeIcon type={placeTypeForUi} className="h-4 w-4" />
                    )}
                  </button>
                )}

                <div className="min-w-0 flex-1">
                  {isTransfer ? (
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700/80 dark:text-sky-400/90">
                      Deslocamento
                      {modeLabel ? ` · ${modeLabel}` : null}
                    </p>
                  ) : null}
                  <div className="flex items-start gap-1.5">
                    <p
                      className={cn(
                        "min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-snug",
                        status !== "pending" &&
                          "text-muted-foreground line-through"
                      )}
                    >
                      {act.title}
                    </p>
                    {isGoogleMapsUrl(act.link_url) ? (
                      <a
                        href={act.link_url!}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                        aria-label={`Abrir ${act.title} no Google Maps`}
                        title="Abrir no Google Maps"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        Maps
                      </a>
                    ) : act.link_url?.trim() ? (
                      <a
                        href={act.link_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"
                        aria-label={`Abrir link de ${act.title}`}
                        title="Abrir link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>

                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    {boarding ? (
                      // Item próprio, antes da partida: a seta de `partida → chegada` significa
                      // trajeto, e embarque não é trajeto. É também o horário que decide quando
                      // sair do hotel, então vem primeiro.
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-1.5 py-px font-medium tabular-nums text-sky-700 dark:text-sky-300">
                        <Plane className="h-3 w-3" aria-hidden />
                        Embarque {boarding}
                      </span>
                    ) : null}
                    {act.activity_time ? (
                      <span className="inline-flex items-center gap-1 font-medium tabular-nums text-foreground">
                        <Clock className="h-3 w-3" aria-hidden />
                        {isTransfer && arrive
                          ? `${act.activity_time} → ${arrive}`
                          : act.activity_time}
                      </span>
                    ) : null}
                    {!isTransfer ? <span>{categoryLabel}</span> : null}
                    {act.is_reserved ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-px font-medium text-primary">
                        <CalendarCheck className="h-3 w-3" aria-hidden />
                        Reservado
                      </span>
                    ) : null}
                    {!isTransfer && place?.rating ? (
                      <span className="inline-flex items-center gap-0.5 tabular-nums">
                        <Star
                          className="h-3 w-3 fill-warning text-warning"
                          aria-hidden
                        />
                        {formatRating(place.rating)}
                      </span>
                    ) : null}
                    {!isTransfer && place?.amount ? (
                      <span className="tabular-nums">
                        {formatBRL(place.amount)}
                      </span>
                    ) : null}
                    {!isTransfer && status === "completed" && doneAt ? (
                      <span className="tabular-nums">concluída às {doneAt}</span>
                    ) : null}
                    {!isTransfer && status === "skipped" && skippedAt ? (
                      <span className="tabular-nums">pulada às {skippedAt}</span>
                    ) : null}
                  </div>

                  {act.notes ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {act.notes}
                    </p>
                  ) : null}
                  {!isTransfer && place?.address ? (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">{place.address}</span>
                    </p>
                  ) : null}
                </div>

                {showAuthor ? (
                  <Avatar
                    className="mt-0.5 h-6 w-6 shrink-0"
                    title={
                      authorName
                        ? `Adicionado por ${authorName}`
                        : "Quem adicionou"
                    }
                  >
                    {authorAvatar ? (
                      <AvatarImage
                        src={authorAvatar}
                        alt={authorName ?? ""}
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    <AvatarFallback
                      className="text-[11px] font-medium text-white"
                      style={{ backgroundColor: fallbackColor }}
                    >
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                ) : null}

                {/* Assets: o mesmo botão em evento e em deslocamento — os dois querem "coisas
                    importantes anexadas a esta linha". Mostra a contagem quando há algo, para o
                    card dizer que existe documento sem precisar abrir. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "-my-0.5 h-8 shrink-0 gap-1 px-1.5 text-muted-foreground",
                    assetCount > 0 && "text-foreground"
                  )}
                  aria-label={
                    assetCount > 0
                      ? `Assets de ${act.title}: ${assetCount}`
                      : `Anexar assets em ${act.title}`
                  }
                  title="Arquivos e links desta linha do roteiro"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAssets(act);
                  }}
                >
                  <Paperclip className="h-4 w-4" />
                  {assetCount > 0 ? (
                    <span className="text-[11px] font-semibold tabular-nums">
                      {assetCount}
                    </span>
                  ) : null}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-my-0.5 h-8 w-8 shrink-0 text-muted-foreground"
                      aria-label={`Mais ações de ${act.title}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {!isTransfer && status === "pending" ? (
                      <>
                        <DropdownMenuItem
                          onClick={() =>
                            void onSetStatus(act.id, "completed", act)
                          }
                        >
                          <Check className="h-3.5 w-3.5" />
                          Concluir
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            void onSetStatus(act.id, "skipped", act)
                          }
                        >
                          <SkipForward className="h-3.5 w-3.5" />
                          Pular
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {!isTransfer && status !== "pending" ? (
                      <DropdownMenuItem
                        onClick={() => void onSetStatus(act.id, "pending", act)}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Reabrir
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onClick={() => onEditActivity(act)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onOpenAssets(act)}>
                      <Paperclip className="h-3.5 w-3.5" />
                      Assets{assetCount > 0 ? ` (${assetCount})` : ""}
                    </DropdownMenuItem>
                    {act.link_url && !isGoogleMapsUrl(act.link_url) ? (
                      <DropdownMenuItem asChild>
                        <a
                          href={act.link_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Abrir link
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleting(act)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 border-dashed border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
          onClick={() => onAddActivity(day.id)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Adicionar evento
        </Button>
        {onAddTransfer ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 border-dashed border-sky-500/40 text-sky-700 hover:bg-sky-500/10 dark:text-sky-400"
            aria-label="Adicionar deslocamento"
            title="Adicionar deslocamento entre lugares"
            onClick={() => onAddTransfer(day.id)}
          >
            <Plane className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting && isTransportActivity(deleting)
                ? "Excluir este deslocamento?"
                : "Excluir este evento?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” sai do roteiro. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = deleting?.id;
                setDeleting(null);
                if (!id) return;
                onActivityDeleted?.(id);
                void deleteItineraryActivity(id).catch(() => onReload());
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
