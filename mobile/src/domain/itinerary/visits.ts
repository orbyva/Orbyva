import type { TripItineraryActivity } from "@/types/travel";

import { parseHHmmToMinutes } from "./duration";

export type VisitStatus = "pending" | "completed" | "skipped";

export function normalizeVisitStatus(
  status: string | null | undefined
): VisitStatus {
  if (status === "completed" || status === "skipped") return status;
  return "pending";
}

/** Ordena por horário (HH:mm) e depois sort_order — igual ao web. */
export function sortVisitsForDay<
  T extends Pick<TripItineraryActivity, "activity_time" | "sort_order">,
>(visits: T[]): T[] {
  return [...visits].sort((a, b) => {
    const ta = parseHHmmToMinutes(a.activity_time);
    const tb = parseHHmmToMinutes(b.activity_time);
    if (ta != null && tb != null && ta !== tb) return ta - tb;
    if (ta != null && tb == null) return -1;
    if (ta == null && tb != null) return 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

/** Subir `moving` acima de `above` não pode inverter horários do dia. */
export function canMoveActivityEarlier(
  above: Pick<TripItineraryActivity, "activity_time">,
  moving: Pick<TripItineraryActivity, "activity_time">
): boolean {
  const tAbove = parseHHmmToMinutes(above.activity_time);
  const tMoving = parseHHmmToMinutes(moving.activity_time);
  if (tMoving == null && tAbove != null) return false;
  if (tMoving == null || tAbove == null) return true;
  return tMoving <= tAbove;
}

export type DayKind = "past" | "today" | "future" | "undated";

/** Situação do dia no calendário + rótulo curto de distância até hoje. */
export function describeDayOffset(params: {
  dayDate: string | null | undefined;
  todayIso: string;
}): { kind: DayKind; label: string | null } {
  const day = params.dayDate?.slice(0, 10);
  const today = params.todayIso.slice(0, 10);
  if (!day) return { kind: "undated", label: null };
  if (day === today) return { kind: "today", label: "Hoje" };

  const diff = diffCalendarDays(day, today);
  if (diff == null) return { kind: "undated", label: null };
  if (diff < 0) {
    return { kind: "past", label: diff === -1 ? "ontem" : null };
  }
  return { kind: "future", label: diff === 1 ? "amanhã" : `em ${diff} dias` };
}

function diffCalendarDays(iso: string, fromIso: string): number | null {
  const target = new Date(`${iso}T12:00:00`);
  const base = new Date(`${fromIso}T12:00:00`);
  if (Number.isNaN(target.getTime()) || Number.isNaN(base.getTime())) {
    return null;
  }
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}

/** Dia da semana abreviado, sem ponto: "qua", "sáb". */
export function formatWeekdayShortBR(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date
    .toLocaleDateString("pt-BR", { weekday: "short" })
    .replace(/\.$/, "");
}
