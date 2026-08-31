import {
  BookOpen,
  Car,
  CheckCircle2,
  Clapperboard,
  Disc3,
  HeartPulse,
  MapPin,
  Plane,
  Target,
  Wallet,
} from "lucide-react";
import type { AppAlert } from "@/api/alerts";
import type { LifeDashboardSummary, TimelineItem } from "@/types/timeline";

export const HOME_MODULES = [
  {
    label: "Finanças",
    subtitle: "Lançamentos",
    href: "/finance/dashboard",
    icon: Wallet,
    tone: "bg-primary/10 text-primary",
  },
  {
    label: "Cinema",
    subtitle: "Filmes e séries",
    href: "/movies",
    icon: Clapperboard,
    tone: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400",
  },
  {
    label: "Livros",
    subtitle: "Lendo e lidos",
    href: "/books",
    icon: BookOpen,
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  {
    label: "Música",
    subtitle: "Álbuns e EPs",
    href: "/music",
    icon: Disc3,
    tone: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  },
  {
    label: "Hábitos",
    subtitle: "Rotina do dia",
    href: "/habits",
    icon: CheckCircle2,
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    label: "Saúde",
    subtitle: "Medicações e consultas",
    href: "/life/health",
    icon: HeartPulse,
    tone: "bg-[hsl(var(--health))]/10 text-[hsl(var(--health))]",
  },
  {
    label: "Metas",
    subtitle: "Progresso longo prazo",
    href: "/goals",
    icon: Target,
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    label: "Viagens",
    subtitle: "Planeje e viva",
    href: "/travel",
    icon: Plane,
    tone: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  },
  {
    label: "Lugares",
    subtitle: "Onde você esteve",
    href: "/places",
    icon: MapPin,
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  {
    label: "Veículos",
    subtitle: "Tudo do seu carro",
    href: "/car",
    icon: Car,
    tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
] as const;

export const MODULE_DOT: Record<string, string> = {
  finance: "bg-primary",
  car: "bg-[hsl(var(--car))]",
  travel: "bg-[hsl(var(--travel))]",
  goals: "bg-emerald-500",
  habits: "bg-violet-500",
  places: "bg-sky-500",
  cinema: "bg-[hsl(var(--cinema))]",
  health: "bg-[hsl(var(--health))]",
};

export type HubCache = {
  summary: LifeDashboardSummary;
  upcoming: TimelineItem[];
  alerts: AppAlert[];
};

export const HUB_CACHE_KEY = "life_hub_v2";

export function hubCacheKey(userId: string | undefined): string {
  return userId ? `${HUB_CACHE_KEY}:${userId}` : HUB_CACHE_KEY;
}

export function daysUntilIso(isoDate: string, from = new Date()): number {
  const target = new Date(`${isoDate}T12:00:00`);
  const start = new Date(from);
  start.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function formatShortDate(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

export function todayHeading(d = new Date()): string {
  const raw = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function firstNameFromUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null): string | null {
  const meta = user?.user_metadata ?? {};
  const raw =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.given_name === "string" && meta.given_name) ||
    (user?.email ? user.email.split("@")[0] : "") ||
    "";
  const first = raw.trim().split(/\s+/)[0] ?? "";
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function severityAccent(severity: AppAlert["severity"]): string {
  if (severity === "danger") {
    return "border-destructive/25 bg-destructive/[0.06]";
  }
  if (severity === "warning") {
    return "border-amber-500/25 bg-amber-500/[0.06]";
  }
  return "border-border bg-card";
}

export function severityIcon(severity: AppAlert["severity"]): string {
  if (severity === "danger") return "text-destructive";
  if (severity === "warning") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function budgetMonthIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}
