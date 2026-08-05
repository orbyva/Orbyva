/** @deprecated Use `@/lib/geoapifyPlaces` e `@/lib/googleRoutes`. */
export {
  searchPlaces as searchPlacesCatalog,
  GeoapifyNotConfiguredError as PlacesNotConfiguredError,
  MapsQuotaExceededError,
  mapGeoapifyCategoryToPlaceType as mapGoogleTypeToPlaceType,
  formatDistanceMeters,
  type PlaceSearchHit,
} from "@/lib/geoapifyPlaces";

export {
  fetchTravelRoutes,
  clearRouteCache,
  RoutesNotConfiguredError,
  type RouteLegResult,
  type LatLng,
} from "@/lib/googleRoutes";

export {
  computeLeaveByHHmm,
  formatDurationFriendly as formatDurationSeconds,
} from "@/domain/itinerary/visits";
