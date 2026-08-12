import type { PlaceType } from "@/types/places";

/**
 * Identidade visual de cada tipo de lugar (ícone + tom), compartilhada entre
 * Lugares e o roteiro de viagem.
 *
 * Cor aqui é **identidade**, nunca estado: os tons não usam os tokens
 * `success`/`warning`/`destructive`/`primary`, reservados para status.
 * O domínio guarda só a chave do ícone, quem resolve para Lucide é
 * `PlaceTypeIcon`, como `travelModes.ts` faz com `TravelModeIcon`.
 */
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

export type PlaceTypeMeta = {
  icon: PlaceTypeIconKey;
  /** Fundo + texto do chip; o mesmo par serve para pílula com rótulo. */
  tone: string;
  /** Bolinha para filtros e listas densas. */
  dot: string;
};

/** Tons em `-700`/`dark:-400`: contraste AA até em `text-[10px]`. */
export const PLACE_TYPE_META: Record<PlaceType, PlaceTypeMeta> = {
  restaurant: {
    icon: "utensils",
    tone: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  cafe: {
    icon: "coffee",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  bar: {
    icon: "martini",
    tone: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400",
    dot: "bg-fuchsia-500",
  },
  attraction: {
    icon: "camera",
    tone: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
    dot: "bg-cyan-500",
  },
  hotel: {
    icon: "bed",
    tone: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
    dot: "bg-indigo-500",
  },
  park: {
    icon: "trees",
    tone: "bg-lime-500/15 text-lime-700 dark:text-lime-400",
    dot: "bg-lime-500",
  },
  museum: {
    icon: "landmark",
    tone: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
    dot: "bg-purple-500",
  },
  shop: {
    icon: "shopping-bag",
    tone: "bg-pink-500/15 text-pink-700 dark:text-pink-400",
    dot: "bg-pink-500",
  },
  other: {
    icon: "pin",
    tone: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
};

export function placeTypeMeta(type: PlaceType | null | undefined): PlaceTypeMeta {
  return (type && PLACE_TYPE_META[type]) || PLACE_TYPE_META.other;
}
