import { Plus } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PlaceCard } from "@/components/PlaceCard";
import { PlaceFormDialog } from "@/components/PlaceFormDialog";
import type { PlaceVisit } from "@/types/places";

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
  return (
    <TabsContent value="places" className="mt-4 space-y-4">
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
        <PlaceFormDialog
          tripId={tripId}
          onSaved={onReload}
          trigger={
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Avaliar lugar visitado
            </Button>
          }
        />
      </div>
      {places.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum lugar avaliado nesta viagem ainda. Registre restaurantes,
          passeios e mais!
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {places.map((p) => (
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
