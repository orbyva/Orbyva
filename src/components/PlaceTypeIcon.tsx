import {
  BedDouble,
  Camera,
  Coffee,
  Landmark,
  MapPin,
  Martini,
  ShoppingBag,
  Trees,
  UtensilsCrossed,
  type LucideProps,
} from "lucide-react";
import { placeTypeMeta } from "@/domain/places";
import type { PlaceType } from "@/types/places";
import { cn } from "@/lib/utils";

const ICON_BY_KEY = {
  utensils: UtensilsCrossed,
  coffee: Coffee,
  martini: Martini,
  camera: Camera,
  bed: BedDouble,
  trees: Trees,
  landmark: Landmark,
  "shopping-bag": ShoppingBag,
  pin: MapPin,
} as const;

type Props = {
  type: PlaceType | null | undefined;
  className?: string;
} & Omit<LucideProps, "ref">;

export function PlaceTypeIcon({ type, className, ...props }: Props) {
  const Icon = ICON_BY_KEY[placeTypeMeta(type).icon] ?? MapPin;
  return (
    <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} aria-hidden {...props} />
  );
}
