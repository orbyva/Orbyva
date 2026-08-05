import { Bike, Bus, Car, Footprints, type LucideProps } from "lucide-react";
import { travelModeMeta, type TravelModeKey } from "@/domain/itinerary/travelModes";
import { cn } from "@/lib/utils";

const ICON_BY_KEY = {
  car: Car,
  bus: Bus,
  bike: Bike,
  walk: Footprints,
} as const;

type Props = {
  mode: TravelModeKey | string;
  className?: string;
} & Omit<LucideProps, "ref">;

export function TravelModeIcon({ mode, className, ...props }: Props) {
  const meta = travelModeMeta(mode);
  const Icon = ICON_BY_KEY[meta.icon] ?? Car;
  return (
    <Icon
      className={cn("h-4 w-4 shrink-0 text-muted-foreground", className)}
      aria-label={meta.label}
      aria-hidden={false}
      {...props}
    />
  );
}
