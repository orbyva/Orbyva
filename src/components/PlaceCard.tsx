import { MapPin, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { StarRating } from "@/components/StarRating";
import { PLACE_TYPE_EMOJI, PLACE_TYPE_LABELS, getRatingLabel } from "@/domain/places";
import type { PlaceVisit } from "@/types/places";
import { formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface PlaceCardProps {
  place: PlaceVisit;
  onClick?: () => void;
  onDelete?: () => void;
}

export function PlaceCard({ place, onClick, onDelete }: PlaceCardProps) {
  const content = (
    <article
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm hover:border-primary/30 transition-colors",
        onDelete && "group"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{PLACE_TYPE_EMOJI[place.type]}</span>
            <Badge variant="outline" className="text-[10px]">
              {PLACE_TYPE_LABELS[place.type]}
            </Badge>
          </div>
          <h3 className="font-semibold truncate">{place.name}</h3>
          {place.address && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{place.address}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {place.would_recommend ? (
            <ThumbsUp className="h-4 w-4 text-success" />
          ) : (
            <ThumbsDown className="h-4 w-4 text-destructive" />
          )}
          {onDelete && (
            <ConfirmDeleteDialog
              title="Excluir este lugar?"
              description={`A avaliação de "${place.name}" será removida.`}
              onConfirm={onDelete}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Excluir ${place.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </ConfirmDeleteDialog>
          )}
        </div>
      </div>

      {place.rating != null && place.rating > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <StarRating value={place.rating} readonly size="sm" />
          <span className="text-xs text-muted-foreground">
            {getRatingLabel(place.rating)}
          </span>
        </div>
      )}

      {place.notes && (
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
          {place.notes}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatDateBR(place.visited_date)}</span>
        {place.trip && (
          <span className="text-primary truncate max-w-[140px]">
            {place.trip.title}
          </span>
        )}
      </div>
    </article>
  );

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        className="w-full text-left cursor-pointer"
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        {content}
      </div>
    );
  }

  return content;
}
