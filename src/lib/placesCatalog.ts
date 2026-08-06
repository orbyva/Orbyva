/** @deprecated Use `@/lib/googlePlaces` e `@/lib/googleRoutes`. */
export {
  searchPlaces as searchPlacesCatalog,
  PlacesNotConfiguredError,
  mapPlaceCategoryToPlaceType as mapGoogleTypeToPlaceType,
  formatDistanceMeters,
  type PlaceSearchHit,
} from "@/lib/googlePlaces";

export {
  fetchTravelRoutes,
  clearRouteCache,
  RoutesNotConfiguredError,
  MapsQuotaExceededError,
  type RouteLegResult,
  type LatLng,
} from "@/lib/googleRoutes";
