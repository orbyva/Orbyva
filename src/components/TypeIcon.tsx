import type { CSSProperties } from "react";
import {
  Activity,
  Award,
  Baby,
  Banknote,
  BarChart2,
  Beer,
  Bell,
  Bike,
  Book,
  Briefcase,
  Building2,
  Bus,
  Calendar,
  Car,
  CircleDollarSign,
  ClipboardList,
  Clock,
  CloudRain,
  Coffee,
  Coins,
  Cpu,
  CreditCard,
  DollarSign,
  Dog,
  Dumbbell,
  Film,
  Flower2,
  Fuel,
  Gamepad2,
  Gift,
  Globe,
  GraduationCap,
  Hammer,
  HandCoins,
  Heart,
  HeartPulse,
  Home,
  Hotel,
  Landmark,
  MapPin,
  Mountain,
  Music,
  Package,
  PawPrint,
  Percent,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Stethoscope,
  Store,
  Ticket,
  Train,
  TrendingDown,
  TrendingUp,
  Truck,
  Tv,
  Umbrella,
  Utensils,
  Wallet,
  Waves,
  Wifi,
  Wine,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, LucideIcon> = {
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  banknote: Banknote,
  coins: Coins,
  "hand-coins": HandCoins,
  "dollar-sign": DollarSign,
  "credit-card": CreditCard,
  receipt: Receipt,
  landmark: Landmark,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  percent: Percent,
  briefcase: Briefcase,
  "building-2": Building2,
  store: Store,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  package: Package,
  home: Home,
  hotel: Hotel,
  utensils: Utensils,
  coffee: Coffee,
  wine: Wine,
  beer: Beer,
  car: Car,
  bike: Bike,
  bus: Bus,
  train: Train,
  fuel: Fuel,
  plane: Plane,
  truck: Truck,
  "map-pin": MapPin,
  globe: Globe,
  heart: Heart,
  "heart-pulse": HeartPulse,
  stethoscope: Stethoscope,
  pill: Pill,
  dumbbell: Dumbbell,
  activity: Activity,
  baby: Baby,
  "graduation-cap": GraduationCap,
  book: Book,
  sparkles: Sparkles,
  film: Film,
  tv: Tv,
  music: Music,
  "gamepad-2": Gamepad2,
  ticket: Ticket,
  gift: Gift,
  shirt: Shirt,
  scissors: Scissors,
  "paw-print": PawPrint,
  dog: Dog,
  smartphone: Smartphone,
  wifi: Wifi,
  zap: Zap,
  cpu: Cpu,
  wrench: Wrench,
  hammer: Hammer,
  "clipboard-list": ClipboardList,
  calendar: Calendar,
  clock: Clock,
  bell: Bell,
  umbrella: Umbrella,
  "flower-2": Flower2,
  mountain: Mountain,
  waves: Waves,
  "cloud-rain": CloudRain,
  "bar-chart-2": BarChart2,
  award: Award,
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

