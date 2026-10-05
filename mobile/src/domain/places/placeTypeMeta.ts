import type { PlaceType } from "@/types/places";

export type PlaceTypeIconKey =
  | "utensils"
  | "coffee"
  | "martini"
  | "camera"
  | "bed"
  | "trees"
  | "landmark"
  | "shopping-bag"
  | "pin";

export type PlaceTypeTone = {
  icon: PlaceTypeIconKey;
  bg: string;
  fg: string;
};

// token-livre-início: paleta categórica espelhada de src/domain/places/placeTypeMeta.ts do web
export const PLACE_TYPE_META: Record<PlaceType, PlaceTypeTone> = {
  restaurant: { icon: "utensils", bg: "rgba(244,63,94,0.15)", fg: "#BE123C" },
  cafe: { icon: "coffee", bg: "rgba(245,158,11,0.18)", fg: "#B45309" },
  bar: { icon: "martini", bg: "rgba(217,70,239,0.16)", fg: "#A21CAF" },
  attraction: { icon: "camera", bg: "rgba(6,182,212,0.16)", fg: "#0E7490" },
  hotel: { icon: "bed", bg: "rgba(99,102,241,0.16)", fg: "#4338CA" },
  park: { icon: "trees", bg: "rgba(132,204,22,0.18)", fg: "#4D7C0F" },
  museum: { icon: "landmark", bg: "rgba(168,85,247,0.16)", fg: "#7E22CE" },
  shop: { icon: "shopping-bag", bg: "rgba(236,72,153,0.16)", fg: "#BE185D" },
  other: { icon: "pin", bg: "rgba(100,116,139,0.16)", fg: "#475569" },
};
// token-livre-fim

export function placeTypeMeta(type: PlaceType | null | undefined): PlaceTypeTone {
  return (type && PLACE_TYPE_META[type]) || PLACE_TYPE_META.other;
}
