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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/StarRating";
import {
  PLACE_TYPE_EMOJI,
  PLACE_TYPE_LABELS,
  formatRating,
  getRatingLabel,
} from "@/domain/places";
import type { PlaceVisit } from "@/types/places";
import { formatDateBR } from "@/lib/currency";
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{PLACE_TYPE_EMOJI[place.type]}</span>
              <Badge variant="outline" className="text-[10px]">
                {PLACE_TYPE_LABELS[place.type]}
              </Badge>
              {multi ? (
                <Badge variant="secondary" className="text-[10px]">
                  {summary!.totalOpinions} opiniões
                </Badge>
              ) : null}
            </div>
            <h3 className="font-semibold truncate">{place.name}</h3>
            {place.address && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{place.address}</span>
              </p>
            )}
          </div>

          {multi && summary ? (
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
          )}
        </div>

        {starValue != null && displayRating != null && displayRating > 0 ? (
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
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
            {place.notes}
          </p>
        ) : null}

        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatDateBR(place.visited_date)}</span>
          {place.trip && (
            <span className="text-primary truncate max-w-[140px]">
              {place.trip.title}
            </span>
          )}
        </div>
      </div>

      {onDelete && (
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
      )}
    </article>
  );
}
