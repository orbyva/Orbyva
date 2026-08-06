import { useState } from "react";
import { MapPin, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PlaceTypeIcon } from "@/components/PlaceTypeIcon";
import { StatusPill, ToneChip } from "@/components/StatusPill";
import { StarRating } from "@/components/StarRating";
import {
  PLACE_TYPE_LABELS,
  formatRating,
  getRatingLabel,
  normalizePlaceStatus,
  placeTypeMeta,
} from "@/domain/places";
import type { PlaceVisit } from "@/types/places";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface PlaceCardProps {
  place: PlaceVisit;
  onClick?: () => void;
  onDelete?: () => void;
}

export function PlaceCard({ place, onClick, onDelete }: PlaceCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const summary = place.opinionSummary;
  const multi = (summary?.totalOpinions ?? 0) > 1;
  const displayRating = multi
    ? summary?.avgRating
    : place.rating != null && place.rating > 0
      ? place.rating
      : summary?.avgRating;
  const starValue =
    displayRating != null ? Math.round(displayRating * 2) / 2 : null;
  const isToVisit =
    normalizePlaceStatus(place.status, place.visited_date) === "to_visit";
  const typeMeta = placeTypeMeta(place.type);

  return (
    <article
      className={cn(
        "relative rounded-xl border bg-card p-4 shadow-sm hover:border-primary/30 transition-colors",
        onDelete && "group"
      )}
    >
      <div
        className={cn(onClick && "cursor-pointer")}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <div className="flex items-start justify-between gap-2 pr-8">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                typeMeta.tone
              )}
              aria-hidden
            >
              <PlaceTypeIcon type={place.type} className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <ToneChip toneClassName={typeMeta.tone}>
                  {PLACE_TYPE_LABELS[place.type]}
                </ToneChip>
                {isToVisit ? (
                  <StatusPill tone="warning">Para visitar</StatusPill>
                ) : (
                  <StatusPill tone="success">Visitado</StatusPill>
                )}
                {multi ? (
                  <StatusPill tone="muted">
                    {summary!.totalOpinions} opiniões
                  </StatusPill>
                ) : null}
              </div>
              <h3 className="truncate font-semibold">{place.name}</h3>
              {place.address ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{place.address}</span>
                </p>
              ) : null}
            </div>
          </div>

          {!isToVisit ? (
            multi && summary ? (
              <div className="flex shrink-0 items-center gap-2 text-[11px] font-medium">
                <span className="inline-flex items-center gap-1 text-success">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  {summary.recommendYes}
                </span>
                <span className="inline-flex items-center gap-1 text-destructive">
                  <ThumbsDown className="h-3.5 w-3.5" />
                  {summary.recommendNo}
                </span>
              </div>
            ) : place.would_recommend ? (
              <ThumbsUp className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <ThumbsDown className="h-4 w-4 shrink-0 text-destructive" />
            )
          ) : null}
        </div>

        {!isToVisit &&
        starValue != null &&
        displayRating != null &&
        displayRating > 0 ? (
          <div className="mt-2 flex items-center gap-2">
            <StarRating value={starValue} readonly size="sm" />
            <span className="text-xs text-muted-foreground">
              {formatRating(displayRating)}
              {multi
                ? ` · média · ${getRatingLabel(displayRating)}`
                : ` · ${getRatingLabel(displayRating)}`}
            </span>
          </div>
        ) : null}

        {place.notes && !multi ? (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {place.notes}
          </p>
        ) : null}

        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {isToVisit
              ? "Na lista"
              : formatDateBR(place.visited_date)}
            {!isToVisit && place.amount != null && place.amount > 0
              ? ` · ${formatBRL(place.amount)}${
                  place.transaction_id != null ? " · extrato" : ""
                }`
              : ""}
          </span>
          {place.trip ? (
            <span className="max-w-[140px] truncate text-primary">
              {place.trip.title}
            </span>
          ) : null}
        </div>
      </div>

      {onDelete ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 z-10 h-7 w-7 text-destructive opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDeleteOpen(true);
            }}
            aria-label={`Excluir ${place.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>Excluir este lugar?</AlertDialogHeader>
              <p className="text-sm text-muted-foreground">
                A avaliação de &quot;{place.name}&quot; será removida.
              </p>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    onDelete();
                    setDeleteOpen(false);
                  }}
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </article>
  );
}
