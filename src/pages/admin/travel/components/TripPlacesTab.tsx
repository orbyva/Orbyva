import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PlaceCard } from "@/components/PlaceCard";
import { PlaceFormDialog } from "@/components/PlaceFormDialog";
import { filterPlaces } from "@/domain/places";
import type { PlaceStatus, PlaceVisit } from "@/types/places";

type TripPlacesTabProps = {
  tripId: string;
  places: PlaceVisit[];
  onReload: () => void;
  onSelectPlace: (place: PlaceVisit) => void;
};

export function TripPlacesTab({
  tripId,
  places,
  onReload,
  onSelectPlace,
}: TripPlacesTabProps) {
  const [statusFilter, setStatusFilter] = useState<PlaceStatus>("to_visit");

  const filtered = useMemo(
    () =>
      filterPlaces(places, {
        category: "all",
        status: statusFilter,
      }),
    [places, statusFilter]
  );

  const toVisitCount = places.filter(
    (p) => (p.status ?? "visited") === "to_visit"
  ).length;
  const visitedCount = places.length - toVisitCount;

  return (
    <TabsContent value="places" className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as PlaceStatus)}
        >
          <TabsList>
            <TabsTrigger value="to_visit">
              Para visitar ({toVisitCount})
            </TabsTrigger>
            <TabsTrigger value="visited">
              Visitados ({visitedCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <PlaceFormDialog
          tripId={tripId}
          defaultStatus={statusFilter}
          onSaved={onReload}
          trigger={
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              {statusFilter === "to_visit"
                ? "Adicionar para visitar"
                : "Avaliar lugar visitado"}
            </Button>
          }
        />
      </div>
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {statusFilter === "to_visit"
            ? "Nada na lista ainda. Salve restaurantes e passeios que você quer conhecer nesta viagem."
            : "Nenhum lugar avaliado nesta viagem ainda."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((p) => (
            <PlaceCard
              key={p.id}
              place={p}
              onClick={() => onSelectPlace(p)}
            />
          ))}
        </div>
      )}
    </TabsContent>
  );
}
