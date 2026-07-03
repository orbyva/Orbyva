import type { CSSProperties } from "react";
import {
  Activity,
  Award,
  BarChart2,
  Bell,
  Book,
  Briefcase,
  Calendar,
  Car,
  CircleDollarSign,
  Clock,
  Coffee,
  Cpu,
  CreditCard,
  DollarSign,
  Dribbble,
  Film,
  Gift,
  Globe,
  Heart,
  Home,
  MapPin,
  Music,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  Truck,
  Tv,
  Umbrella,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const TYPE_ICON_OPTIONS = [
  "wrench",
  "utensils",
  "activity",
  "briefcase",
  "dollar-sign",
  "credit-card",
  "shopping-bag",
  "shopping-cart",
  "heart",
  "coffee",
  "home",
  "car",
  "book",
  "plane",
  "gift",
  "music",
  "film",
  "calendar",
  "clock",
  "globe",
  "map-pin",
  "umbrella",
  "truck",
  "bell",
  "bar-chart-2",
  "award",
  "ticket",
  "tv",
  "cpu",
  "dribbble",
] as const;

const ICON_MAP: Record<string, LucideIcon> = {
  wrench: Wrench,
  utensils: Utensils,
  activity: Activity,
  briefcase: Briefcase,
  "dollar-sign": DollarSign,
  "credit-card": CreditCard,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  heart: Heart,
  coffee: Coffee,
  home: Home,
  car: Car,
  book: Book,
  plane: Plane,
  gift: Gift,
  music: Music,
  film: Film,
  calendar: Calendar,
  clock: Clock,
  globe: Globe,
  "map-pin": MapPin,
  umbrella: Umbrella,
  truck: Truck,
  bell: Bell,
  "bar-chart-2": BarChart2,
  award: Award,
  ticket: Ticket,
  tv: Tv,
  cpu: Cpu,
  dribbble: Dribbble,
};

interface TypeIconProps {
  name?: string | null;
  className?: string;
  style?: CSSProperties;
  size?: number;
}

export function TypeIcon({ name, className, style, size = 16 }: TypeIconProps) {
  const Icon = name ? ICON_MAP[name] : null;

  if (!Icon) {
    return (
      <CircleDollarSign
        className={cn("shrink-0", className)}
        style={style}
        size={size}
        aria-hidden
      />
    );
  }

  return (
    <Icon
      className={cn("shrink-0", className)}
      style={style}
      size={size}
      aria-hidden
    />
  );
}
