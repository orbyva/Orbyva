import { GripVertical, MapPin, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlaceTypeIcon } from "@/components/PlaceTypeIcon";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { PLACE_TYPE_LABELS, placeTypeMeta } from "@/domain/places";
import {
  suggestionHeading,
  type GeoAnchor,
} from "@/domain/travel/savedPlaceSuggestions";
import type { PlaceVisit } from "@/types/places";
import { cn } from "@/lib/utils";

export const SAVED_PLACE_DRAG_PREFIX = "saved-place:";

export function savedPlaceDragId(placeId: string): string {
  return `${SAVED_PLACE_DRAG_PREFIX}${placeId}`;
}

export function parseSavedPlaceDragId(id: string | null): string | null {
  if (!id?.startsWith(SAVED_PLACE_DRAG_PREFIX)) return null;
  return id.slice(SAVED_PLACE_DRAG_PREFIX.length);
}

type DragHandleProps = (
  itemId: string,
  label: string
) => Record<string, unknown>;

type ItinerarySavedPlaceSuggestionsProps = {
  tripId: string;
  city: GeoAnchor;
  places: PlaceVisit[];
  addingPlaceId: string | null;
  dragHandleProps: DragHandleProps;
  onDragStart: (placeId: string) => void;
  onDragEnd: () => void;
  onAdd: (place: PlaceVisit) => void;
  onDismiss: (city: GeoAnchor) => void;
};

export function ItinerarySavedPlaceSuggestions({
  tripId,
  city,
  places,
  addingPlaceId,
  dragHandleProps,
  onDragStart,
  onDragEnd,
  onAdd,
  onDismiss,
}: ItinerarySavedPlaceSuggestionsProps) {
  if (places.length === 0) return null;
  const cityLabel = city.name.trim() || "este destino";

  return (
    <section
      className="rounded-xl border border-primary/20 bg-primary/[0.05] px-3 py-2.5"
      aria-label={suggestionHeading(places.length, city.name)}
    >
      <header className="flex items-start gap-2">
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"
          aria-hidden
        >
          <MapPin className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">
            {suggestionHeading(places.length, city.name)}
          </p>
          <p className="text-xs text-muted-foreground">
            Adicione no roteiro deste dia.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 shrink-0", ICON_EDIT_BUTTON_CLASS)}
          aria-label={`Dispensar sugestões de ${cityLabel} nesta viagem`}
          onClick={() => onDismiss(city)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>

      <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">
        {places.map((place) => {
          const tone = placeTypeMeta(place.type).tone;
          const busy = addingPlaceId === place.id;
          const onTrip = place.trip_id === tripId;
          return (
            <li
              key={place.id}
              draggable={!busy}
              onDragStart={() => onDragStart(place.id)}
              onDragEnd={onDragEnd}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-1.5 py-1",
                busy && "opacity-60"
              )}
            >
              <span
                {...dragHandleProps(savedPlaceDragId(place.id), place.name)}
                className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
                title="Arrastar para este ou outro dia"
                aria-hidden
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  tone
                )}
                aria-hidden
              >
                <PlaceTypeIcon type={place.type} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight">
                  {place.name}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {PLACE_TYPE_LABELS[place.type]}
                  {onTrip ? " · Na lista da viagem" : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs text-primary hover:bg-primary/10 hover:text-primary"
                disabled={busy}
                onClick={() => onAdd(place)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Adicionar
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
