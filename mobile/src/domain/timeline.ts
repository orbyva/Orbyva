import type { TimelineItem } from "@/types/timeline";

/** Data local YYYY-MM-DD (não UTC). */
export function getTodayIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return getTodayIso(d);
}

export function resolveTimelineStatus(
  dateIso: string,
  todayIso: string,
  isOverdue = false
): TimelineItem["status"] {
  if (isOverdue || dateIso < todayIso) return "overdue";
  if (dateIso === todayIso) return "today";
  return "upcoming";
}

export function groupTimelineByDate(
  items: TimelineItem[]
): { date: string; dateLabel: string; items: TimelineItem[] }[] {
  const map = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const group = map.get(item.date) ?? [];
    group.push(item);
    map.set(item.date, group);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, groupItems]) => ({
      date,
      dateLabel: date.split("-").reverse().join("/"),
      items: groupItems,
    }));
}

export function getUpcomingTimeline(
  items: TimelineItem[],
  days = 7,
  todayIso = getTodayIso()
): TimelineItem[] {
  const maxIso = addDaysIso(todayIso, days);
  return items.filter(
    (item) => item.date >= todayIso && item.date <= maxIso
  );
}

/** Dias corridos desde a última tx (0 = hoje). null = sem tx. */
export function daysSinceIsoDate(
  iso: string | null | undefined,
  now = new Date()
): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  );
}

export function formatShortDate(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  if (!m || !d) return isoDate;
  return `${d}/${m}`;
}

export function monthLabel(year: number, month: number): string {
  const raw = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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
