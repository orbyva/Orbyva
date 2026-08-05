import { useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Check,
  GripVertical,
  Pencil,
  Plus,
  SkipForward,
  Trash2,
  Undo2,
} from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
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
import { formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  normalizeVisitStatus,
  sortVisitsForDay,
  type VisitLike,
} from "@/domain/itinerary/visits";
import type { TripMember } from "@/types/tripSharing";
import type { PlaceVisit } from "@/types/places";
import type {
  TripItineraryActivity,
  TripItineraryDay,
} from "@/types/travel";
import { ItineraryNextRoutePanel } from "./ItineraryNextRoutePanel";

type TripItineraryTabProps = {
  itinerary: TripItineraryDay[];
  places: PlaceVisit[];
  members: TripMember[];
  user: User | null;
  tripOrigin?: { lat: number; lng: number } | null;
  originLabel?: string | null;
  /** Desativa somente o cálculo de deslocamentos. */
  disableRoutes?: boolean;
  onEditDay: (day: TripItineraryDay) => void;
  onEditActivity: (act: TripItineraryActivity) => void;
  onAddActivity: (dayId: string) => void;
  onReload: () => void;
  onVisitStatusChange: (
    actId: string,
    status: "pending" | "completed" | "skipped"
  ) => void;
  onMoveVisit: (
    actId: string,
    targetDayId: string,
    targetIndex: number
  ) => void;
};

type TimedMoveAttempt = {
  title: string;
  activityTime: string;
};

function enrichVisits(
  day: TripItineraryDay,
  places: PlaceVisit[]
): VisitLike[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  return (day.activities ?? []).map((act) => {
    const place = act.place_visit_id
      ? byId.get(act.place_visit_id)
      : undefined;
    return {
      id: act.id,
      title: act.title,
      activity_time: act.activity_time,
      sort_order: act.sort_order,
      place_visit_id: act.place_visit_id,
      visit_status: act.visit_status,
      completed_at: act.completed_at,
      skipped_at: act.skipped_at,
      lat: place?.lat ?? null,
      lng: place?.lng ?? null,
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
  itinerary,
  places,
  members,
  user,
  tripOrigin,
  originLabel,
  disableRoutes = false,
  onEditDay,
  onEditActivity,
  onAddActivity,
  onReload,
  onVisitStatusChange,
  onMoveVisit,
}: TripItineraryTabProps) {
  const [routeRefresh, setRouteRefresh] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dragVisitId, setDragVisitId] = useState<string | null>(null);
  const [dropDayId, setDropDayId] = useState<string | null>(null);
  const [timedMoveAttempt, setTimedMoveAttempt] =
    useState<TimedMoveAttempt | null>(null);

  async function setStatus(
    actId: string,
    status: "pending" | "completed" | "skipped"
  ) {
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

  function handleDrop(targetDayId: string, targetIndex: number) {
    if (!dragVisitId) return;
    const fromDay = itinerary.find((d) =>
      (d.activities ?? []).some((a) => a.id === dragVisitId)
    );
    const targetDay = itinerary.find((day) => day.id === targetDayId);
    const moving = fromDay?.activities?.find((a) => a.id === dragVisitId);
    setDragVisitId(null);
    setDropDayId(null);
    if (!fromDay || !targetDay || !moving) return;

    const orderedTarget = sortVisitsForDay(targetDay.activities ?? []);
    const originalIndex = orderedTarget.findIndex((a) => a.id === dragVisitId);
    const withoutMoving = orderedTarget.filter((a) => a.id !== dragVisitId);
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

  return (
    <TabsContent value="itinerary" className="mt-4 space-y-4">
      {itinerary.length > 1 ||
        itinerary.some((day) => (day.activities?.length ?? 0) > 1) ? (
        <p className="text-xs text-muted-foreground">
          Arraste visitas para mudar sua ordem ou seu dia. As que possuem
          horário podem mudar de dia, mas mantêm a ordem cronológica.
        </p>
      ) : null}
      {itinerary.map((day) => (
        <DayBlock
          key={day.id}
          day={day}
          places={places}
          members={members}
          user={user}
          tripOrigin={tripOrigin}
          originLabel={originLabel}
          routeRefresh={routeRefresh}
          busyId={busyId}
          disableRoutes={disableRoutes}
          dragVisitId={dragVisitId}
          isDropTarget={dropDayId === day.id && dragVisitId != null}
          onEditDay={onEditDay}
          onEditActivity={onEditActivity}
          onAddActivity={onAddActivity}
          onReload={onReload}
          onSetStatus={setStatus}
          onDragVisitStart={setDragVisitId}
          onDragVisitEnd={() => {
            setDragVisitId(null);
            setDropDayId(null);
          }}
          onDragOverDay={() => setDropDayId(day.id)}
          onDragLeaveDay={() =>
            setDropDayId((cur) => (cur === day.id ? null : cur))
          }
          onDropOnDay={() =>
            handleDrop(day.id, day.activities?.length ?? 0)
          }
          onDropBeforeVisit={(index) => handleDrop(day.id, index)}
        />
      ))}
      <AlertDialog
        open={timedMoveAttempt != null}
        onOpenChange={(open) => {
          if (!open) setTimedMoveAttempt(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Esta visita tem horário definido</AlertDialogTitle>
            <AlertDialogDescription>
              “{timedMoveAttempt?.title}” está marcada para{" "}
              {timedMoveAttempt?.activityTime}. Visitas com horário são
              ordenadas automaticamente dentro do mesmo dia. Você pode
              movê-la para outro dia ou remover o horário na edição para
              ordená-la manualmente.
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
    </TabsContent>
  );
}

function DayBlock({
  day,
  places,
  members,
  user,
  tripOrigin,
  originLabel,
  routeRefresh,
  busyId,
  disableRoutes,
  dragVisitId,
  isDropTarget,
  onEditDay,
  onEditActivity,
  onAddActivity,
  onReload,
  onSetStatus,
  onDragVisitStart,
  onDragVisitEnd,
  onDragOverDay,
  onDragLeaveDay,
  onDropOnDay,
  onDropBeforeVisit,
}: {
  day: TripItineraryDay;
  places: PlaceVisit[];
  members: TripMember[];
  user: User | null;
  tripOrigin?: { lat: number; lng: number } | null;
  originLabel?: string | null;
  routeRefresh: number;
  busyId: string | null;
  disableRoutes: boolean;
  dragVisitId: string | null;
  isDropTarget: boolean;
  onEditDay: (day: TripItineraryDay) => void;
  onEditActivity: (act: TripItineraryActivity) => void;
  onAddActivity: (dayId: string) => void;
  onReload: () => void;
  onSetStatus: (
    id: string,
    status: "pending" | "completed" | "skipped"
  ) => Promise<void>;
  onDragVisitStart: (id: string) => void;
  onDragVisitEnd: () => void;
  onDragOverDay: () => void;
  onDragLeaveDay: () => void;
  onDropOnDay: () => void;
  onDropBeforeVisit: (index: number) => void;
}) {
  const visits = useMemo(() => enrichVisits(day, places), [day, places]);
  const sortedActs = useMemo(() => {
    const order = new Map(
      sortVisitsForDay(visits).map((v, i) => [v.id, i])
    );
    return [...(day.activities ?? [])].sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    );
  }, [day.activities, visits]);

  return (
    <article
      className={cn(
        "rounded-lg border p-4 space-y-3 transition-colors",
        isDropTarget && "border-primary bg-primary/5"
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
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">
          {day.date ? (
            formatDateBR(day.date)
          ) : (
            day.title ?? `Dia ${day.day_number}`
          )}
          {day.date && day.title ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {day.title}
            </span>
          ) : null}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7 shrink-0", ICON_EDIT_BUTTON_CLASS)}
          onClick={() => onEditDay(day)}
          aria-label="Editar dia"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
      {day.notes ? (
        <p className="text-xs text-muted-foreground">{day.notes}</p>
      ) : null}

      <ItineraryNextRoutePanel
        dayDate={day.date}
        visits={visits}
        tripOrigin={tripOrigin}
        originLabel={originLabel}
        refreshKey={routeRefresh}
        disabled={disableRoutes}
      />

      <ul className="space-y-2">
        {sortedActs.map((act, index) => {
          const status = normalizeVisitStatus(act.visit_status);
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
            !!act.created_by_user_id ||
            !!authorName ||
            !!authorAvatar ||
            isMine;
          const doneAt = formatCompletedAt(act.completed_at);
          const skippedAt = formatCompletedAt(act.skipped_at);
          const busy = busyId === act.id;

          return (
            <li
              key={act.id}
              draggable
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
              className={cn(
                "rounded-md border px-2.5 py-2",
                status === "completed" &&
                  "border-emerald-500/20 bg-emerald-500/5",
                status === "skipped" && "bg-muted/40 opacity-80",
                dragVisitId === act.id && "opacity-60"
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
                  title={
                    act.activity_time
                      ? "Arrastar para outro dia; a ordem neste dia segue o horário"
                      : "Arrastar para mudar a ordem ou o dia"
                  }
                  aria-hidden
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                    status === "completed" &&
                      "border-emerald-600 bg-emerald-600 text-white",
                    status === "skipped" && "border-muted-foreground/40",
                    status === "pending" && "border-muted-foreground/50"
                  )}
                  aria-hidden
                >
                  {status === "completed"
                    ? "✓"
                    : status === "skipped"
                      ? "–"
                      : ""}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      status !== "pending" &&
                        "text-muted-foreground line-through"
                    )}
                  >
                    {act.activity_time ? (
                      <span className="text-muted-foreground">
                        {act.activity_time}{" "}
                      </span>
                    ) : null}
                    <span>{act.title}</span>
                  </p>
                  {act.is_reserved ? (
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      Reservado
                    </Badge>
                  ) : null}
                  {status === "completed" && doneAt ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">
                      Concluído às {doneAt}
                    </p>
                  ) : null}
                  {status === "skipped" && skippedAt ? (
                    <p className="text-xs text-muted-foreground">
                      Pulado às {skippedAt}
                    </p>
                  ) : null}
                  {act.notes ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {act.notes}
                    </p>
                  ) : null}
                  {act.link_url ? (
                    <a
                      href={act.link_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Abrir link
                    </a>
                  ) : null}
                </div>

                {showAuthor ? (
                  <Avatar
                    className="h-6 w-6 shrink-0"
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
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1">
                {status === "pending" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() => void onSetStatus(act.id, "completed")}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Concluir
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() => void onSetStatus(act.id, "skipped")}
                    >
                      <SkipForward className="mr-1 h-3 w-3" />
                      Pular
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() => void onSetStatus(act.id, "pending")}
                  >
                    <Undo2 className="mr-1 h-3 w-3" />
                    Desfazer
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-7 w-7", ICON_EDIT_BUTTON_CLASS)}
                  onClick={() => onEditActivity(act)}
                  aria-label="Editar visita"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <ConfirmDeleteDialog
                  title="Excluir esta visita?"
                  onConfirm={() =>
                    deleteItineraryActivity(act.id).then(onReload)
                  }
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </ConfirmDeleteDialog>
              </div>
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => onAddActivity(day.id)}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Adicionar visita
      </Button>
    </article>
  );
}
