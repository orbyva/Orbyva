import { CatalogSearch } from "@/components/CatalogSearch";
import { ThemedText } from "@/components/themed-text";
import { useUserLocationBias } from "@/hooks/use-user-location-bias";
import {
  formatDistanceMeters,
  mapPlaceCategoryToPlaceType,
  resolvePlaceLocation,
  searchPlaces,
  type PlaceSearchHit,
} from "@/lib/googlePlaces";
import type { PlaceType } from "@/types/places";

export type PlaceCatalogPick = {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  google_place_id: string;
  type: PlaceType;
};

export function PlaceCatalogSearch({
  placeholder = "Buscar no Google Maps",
  scope = "all",
  requestUserLocation = true,
  onPick,
}: {
  placeholder?: string;
  scope?: "all" | "regions";
  /** Destino de viagem: não pede GPS (a cidade não é “perto de mim”). */
  requestUserLocation?: boolean;
  onPick: (place: PlaceCatalogPick) => void;
}) {
  const { bias, denied } = useUserLocationBias(requestUserLocation);

  return (
    <>
      {denied && requestUserLocation ? (
        <ThemedText type="small" themeColor="textSecondary">
          Localização negada, a busca funciona, mas sem priorizar lugares
          próximos.
        </ThemedText>
      ) : null}
      <CatalogSearch
        placeholder={placeholder}
        enabled
        unavailableHint="Busca de lugares indisponível."
        search={(query) =>
          searchPlaces({
            query,
            scope,
            lat: bias?.lat,
            lng: bias?.lng,
          })
        }
        toView={(hit: PlaceSearchHit) => ({
          key: hit.placeId,
          title: hit.name,
          subtitle: [hit.address, formatDistanceMeters(hit.distanceMeters)]
            .filter(Boolean)
            .join(" · "),
        })}
        onSelect={(hit) => {
          void (async () => {
            let lat = hit.lat;
            let lng = hit.lng;
            if ((lat == null || lng == null) && hit.placeId) {
              try {
                const resolved = await resolvePlaceLocation({
                  placeId: hit.placeId,
                });
                lat = resolved.lat;
                lng = resolved.lng;
              } catch {
                /* cadastro ainda vale sem coordenada */
              }
            }
            onPick({
              name: hit.name,
              address: hit.address,
              lat,
              lng,
              google_place_id: hit.placeId,
              type: mapPlaceCategoryToPlaceType(hit.category),
            });
          })();
        }}
      />
    </>
  );
}
