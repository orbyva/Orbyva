import type { TripItineraryActivity } from "@/types/travel";

export type VisitStatus = "pending" | "completed" | "skipped";

export type VisitLike = Pick<
  TripItineraryActivity,
  | "id"
  | "title"
  | "activity_time"
  | "arrival_time"
  | "sort_order"
  | "place_visit_id"
  | "visit_status"
  | "completed_at"
  | "skipped_at"
  | "category"
> & {
  lat?: number | null;
  lng?: number | null;
  google_place_id?: string | null;
  day_date?: string | null;
};

export function normalizeVisitStatus(
  status: string | null | undefined
): VisitStatus {
  if (status === "completed" || status === "skipped") return status;
  return "pending";
}

export function isVisitOpen(visit: VisitLike): boolean {
  return normalizeVisitStatus(visit.visit_status) === "pending";
}

export function isVisitDone(visit: VisitLike): boolean {
  const s = normalizeVisitStatus(visit.visit_status);
  return s === "completed" || s === "skipped";
}

/** Ordena por horário (HH:mm) e depois sort_order. */
export function sortVisitsForDay<T extends VisitLike>(visits: T[]): T[] {
  return [...visits].sort((a, b) => {
    const ta = parseHHmmToMinutes(a.activity_time);
    const tb = parseHHmmToMinutes(b.activity_time);
    if (ta != null && tb != null && ta !== tb) return ta - tb;
    if (ta != null && tb == null) return -1;
    if (ta == null && tb != null) return 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

/**
 * Próxima atividade pendente do dia (fonte de verdade = checklist).
 * Prefere horário ainda por vir (≥ agora); só cai em atrasadas se não houver nada na frente.
 * Visitas marcadas antes da chegada de um deslocamento pendente para o mesmo destino
 * são ignoradas (ainda nem chegou lá).
 */
export function findNextPendingVisit(
  visits: VisitLike[],
  nowMinutes?: number | null
): VisitLike | null {
  const sorted = sortVisitsForDay(visits).filter((v) => isVisitOpen(v));
  if (sorted.length === 0) return null;

  const pendingTransfers = sorted.filter(
    (v) => (v.category ?? "").toLowerCase() === "transport"
  );

  function blockedByInboundTransfer(visit: VisitLike): boolean {
    if ((visit.category ?? "").toLowerCase() === "transport") return false;
    const visitT = parseHHmmToMinutes(visit.activity_time);
    if (visitT == null) return false;
    return pendingTransfers.some((tr) => {
      const arrive =
        parseHHmmToMinutes(tr.arrival_time) ??
        parseHHmmToMinutes(tr.activity_time);
      if (arrive == null || visitT >= arrive) return false;
      return visitNearTransferDestination(visit, tr);
    });
  }

  const reachable = sorted.filter((v) => !blockedByInboundTransfer(v));
  const pool = reachable.length > 0 ? reachable : sorted;

  if (nowMinutes == null || !Number.isFinite(nowMinutes)) {
    return pool[0] ?? null;
  }

  const upcoming = pool.find((v) => {
    const depart = parseHHmmToMinutes(v.activity_time);
    const arrive = parseHHmmToMinutes(v.arrival_time);
    if (depart == null && arrive == null) return true;
    if (depart != null && depart >= nowMinutes) return true;
    if (
      (v.category ?? "").toLowerCase() === "transport" &&
      arrive != null &&
      arrive >= nowMinutes
    ) {
      return true;
    }
    return false;
  });
  return upcoming ?? pool[0] ?? null;
}

/** ~55 km — visita no destino do deslocamento (não na origem da volta). */
function visitNearTransferDestination(
  visit: VisitLike,
  transfer: VisitLike
): boolean {
  const vLat = visit.lat;
  const vLng = visit.lng;
  const tLat = transfer.lat;
  const tLng = transfer.lng;
  if (
    typeof vLat !== "number" ||
    typeof vLng !== "number" ||
    typeof tLat !== "number" ||
    typeof tLng !== "number" ||
    !Number.isFinite(vLat) ||
    !Number.isFinite(vLng) ||
    !Number.isFinite(tLat) ||
    !Number.isFinite(tLng)
  ) {
    // Sem coords: se a visita está antes da chegada, assume bloqueio
    // (caso típico ida → visitas no destino).
    return true;
  }
  const dLat = Math.abs(vLat - tLat);
  const dLng = Math.abs(vLng - tLng);
  return dLat < 0.5 && dLng < 0.5;
}

/** Última visita concluída (não pulada), para origem do próximo trecho. */
export function findLastCompletedVisit(
  visits: VisitLike[]
): VisitLike | null {
  const sorted = sortVisitsForDay(visits);
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (normalizeVisitStatus(sorted[i].visit_status) === "completed") {
      return sorted[i];
    }
  }
  return null;
}

/**
 * Visita imediatamente anterior na ordem do dia (qualquer status),
 * usada como fallback de origem.
 */
export function findPreviousVisit(
  visits: VisitLike[],
  currentId: string
): VisitLike | null {
  const sorted = sortVisitsForDay(visits);
  const idx = sorted.findIndex((v) => v.id === currentId);
  if (idx <= 0) return null;
  return sorted[idx - 1] ?? null;
}

export function parseHHmmToMinutes(
  value: string | null | undefined
): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Horário-alvo no painel de rota: chegada do deslocamento, ou horário da visita. */
export function visitScheduleHHmm(visit: VisitLike): string | null {
  const category = (visit.category ?? "").toLowerCase();
  if (category === "transport") {
    const arrive = visit.arrival_time?.trim();
    if (arrive) return arrive.slice(0, 5);
  }
  const t = visit.activity_time?.trim();
  return t ? t.slice(0, 5) : null;
}

export function minutesToHHmm(totalMinutes: number): string {
  const wrapped =
    ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Horário recomendado de saída =
 * horário programado de chegada − duração estimada.
 */
export function computeLeaveByHHmm(params: {
  arrivalHHmm: string;
  durationSeconds: number;
}): string | null {
  const arrival = parseHHmmToMinutes(params.arrivalHHmm);
  if (arrival == null) return null;
  if (!Number.isFinite(params.durationSeconds) || params.durationSeconds < 0) {
    return null;
  }
  const travelMinutes = Math.ceil(params.durationSeconds / 60);
  return minutesToHHmm(arrival - travelMinutes);
}

/**
 * Formato amigável de duração:
 * - < 60 min → "34 min"
 * - < 24 h → "1h12" / "2h"
 * - ≥ 24 h → "1d 2h" / "2d"
 */
export function formatDurationFriendly(
  totalSeconds: number | null | undefined
): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "—";
  }
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (totalHours < 24) {
    if (minutes === 0) return `${totalHours}h`;
    return `${totalHours}h${String(minutes).padStart(2, "0")}`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (hours === 0 && minutes === 0) return `${days}d`;
  if (minutes === 0) return `${days}d ${hours}h`;
  if (hours === 0) return `${days}d ${minutes} min`;
  return `${days}d ${hours}h${String(minutes).padStart(2, "0")}`;
}

export const formatDurationSeconds = formatDurationFriendly;

/** Texto de insight: saída recomendada entre origem e destino. */
export function formatLeaveByInsight(params: {
  destinationTitle: string;
  arrivalHHmm: string;
  originTitle: string;
  leaveByHHmm: string;
  durationSeconds: number;
}): string {
  const duration = formatDurationFriendly(params.durationSeconds);
  return `Para chegar em ${params.destinationTitle} às ${params.arrivalHHmm} saindo de ${params.originTitle}, saia às ${params.leaveByHHmm} (${duration}).`;
}


export type DelayInsight =
  | {
      kind: "on_time";
      leaveByHHmm: string;
      etaHHmm: string;
      durationSeconds: number;
    }
  | {
      kind: "leave_now_late";
      delayMinutes: number;
      etaHHmm: string;
      durationSeconds: number;
    }
  | {
      kind: "leave_now_ok";
      etaHHmm: string;
      durationSeconds: number;
    };

/**
 * Compara leave-by com “agora” (minutos desde meia-noite local).
 */
export function buildDelayInsight(params: {
  arrivalHHmm: string;
  durationSeconds: number;
  nowMinutes: number;
}): DelayInsight | null {
  const arrival = parseHHmmToMinutes(params.arrivalHHmm);
  if (arrival == null) return null;
  if (!Number.isFinite(params.durationSeconds) || params.durationSeconds < 0) {
    return null;
  }

  const travelMinutes = Math.ceil(params.durationSeconds / 60);
  const leaveBy = arrival - travelMinutes;
  const etaFromNow = params.nowMinutes + travelMinutes;
  const etaHHmm = minutesToHHmm(etaFromNow);

  if (params.nowMinutes <= leaveBy) {
    return {
      kind: "on_time",
      leaveByHHmm: minutesToHHmm(leaveBy),
      etaHHmm: params.arrivalHHmm.trim().length === 5
        ? params.arrivalHHmm.trim()
        : minutesToHHmm(arrival),
      durationSeconds: params.durationSeconds,
    };
  }

  if (etaFromNow <= arrival) {
    return {
      kind: "leave_now_ok",
      etaHHmm,
      durationSeconds: params.durationSeconds,
    };
  }

  return {
    kind: "leave_now_late",
    delayMinutes: etaFromNow - arrival,
    etaHHmm,
    durationSeconds: params.durationSeconds,
  };
}

export type RouteInsightTone = "ok" | "tight" | "late";

/** Margem até a hora de sair que já conta como “em cima da hora”. */
const TIGHT_SLACK_MINUTES = 5;

/** Insight do trecho em partes, para a UI alinhar colunas em vez de uma frase. */
export type RouteInsightView = {
  /** Duração do trecho, ex.: "22 min". */
  duration: string;
  /** Quando sair, ex.: "saia às 10:08". Null quando a visita não tem horário. */
  leaveLabel: string | null;
  etaHHmm: string | null;
  status: { tone: RouteInsightTone; label: string } | null;
};

export function describeRouteInsight(params: {
  durationSeconds: number | null | undefined;
  arrivalHHmm?: string | null;
  nowMinutes: number;
}): RouteInsightView | null {
  const { durationSeconds, arrivalHHmm, nowMinutes } = params;
  if (
    durationSeconds == null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0
  ) {
    return null;
  }

  const duration = formatDurationFriendly(durationSeconds);
  const insight = arrivalHHmm
    ? buildDelayInsight({ arrivalHHmm, durationSeconds, nowMinutes })
    : null;
  if (!insight) {
    return { duration, leaveLabel: null, etaHHmm: null, status: null };
  }

  if (insight.kind === "on_time") {
    const arrival = parseHHmmToMinutes(arrivalHHmm);
    const slackMinutes =
      arrival == null
        ? null
        : arrival - Math.ceil(durationSeconds / 60) - nowMinutes;
    const tight =
      slackMinutes != null && slackMinutes <= TIGHT_SLACK_MINUTES;
    return {
      duration,
      leaveLabel: `saia às ${insight.leaveByHHmm}`,
      etaHHmm: insight.etaHHmm,
      status: tight
        ? { tone: "tight", label: "em cima da hora" }
        : { tone: "ok", label: "no horário" },
    };
  }

  if (insight.kind === "leave_now_ok") {
    return {
      duration,
      leaveLabel: "saia agora",
      etaHHmm: insight.etaHHmm,
      status: { tone: "tight", label: "em cima da hora" },
    };
  }

  // Horário vencido: o “atraso” de cada modalidade seria só ruído — quem
  // informa isso é o cabeçalho, uma vez (isScheduledTimePast).
  const scheduleMissed = isScheduledTimePast({ arrivalHHmm, nowMinutes });
  return {
    duration,
    leaveLabel: "saia agora",
    etaHHmm: insight.etaHHmm,
    status: scheduleMissed
      ? null
      : {
          tone: "late",
          label: `atraso de ${formatDurationFriendly(insight.delayMinutes * 60)}`,
        },
  };
}

/** Horário da visita já passou (não é atraso de trajeto, é agenda vencida). */
export function isScheduledTimePast(params: {
  arrivalHHmm?: string | null;
  nowMinutes: number;
}): boolean {
  const arrival = parseHHmmToMinutes(params.arrivalHHmm);
  if (arrival == null) return false;
  return params.nowMinutes > arrival;
}

/**
 * Só calcula rotas no dia do roteiro (calendário local YYYY-MM-DD).
 */
export function shouldComputeRoutesForDay(params: {
  dayDate: string | null | undefined;
  todayIso: string;
}): boolean {
  if (!params.dayDate) return false;
  return params.dayDate.slice(0, 10) === params.todayIso.slice(0, 10);
}

/** Dia do roteiro anterior a hoje (calendário local YYYY-MM-DD). */
export function isPastDay(params: {
  dayDate: string | null | undefined;
  todayIso: string;
}): boolean {
  if (!params.dayDate) return false;
  return params.dayDate.slice(0, 10) < params.todayIso.slice(0, 10);
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

/** Dias civis entre duas datas YYYY-MM-DD (meio-dia local evita DST). */
function diffCalendarDays(iso: string, fromIso: string): number | null {
  const target = new Date(`${iso}T12:00:00`);
  const base = new Date(`${fromIso}T12:00:00`);
  if (Number.isNaN(target.getTime()) || Number.isNaN(base.getTime())) {
    return null;
  }
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}

/** Dia da semana abreviado, sem ponto: "qua", "sáb". */
export function formatWeekdayShortBR(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date
    .toLocaleDateString("pt-BR", { weekday: "short" })
    .replace(/\.$/, "");
}

export type DayVisitsSummary = {
  total: number;
  completed: number;
  skipped: number;
  pending: number;
  /** Percentual resolvido (concluídas + puladas). */
  donePct: number;
};

/** Agregado do checklist do dia, para o indicador de progresso. */
export function summarizeDayVisits(
  visits: { visit_status?: string | null }[]
): DayVisitsSummary {
  let completed = 0;
  let skipped = 0;
  for (const visit of visits) {
    const status = normalizeVisitStatus(visit.visit_status);
    if (status === "completed") completed += 1;
    else if (status === "skipped") skipped += 1;
  }
  const total = visits.length;
  const resolved = completed + skipped;
  return {
    total,
    completed,
    skipped,
    pending: total - resolved,
    donePct: total === 0 ? 0 : Math.round((resolved / total) * 100),
  };
}

export type LatLng = { lat: number; lng: number };

/**
 * Origem do próximo trecho:
 * 1. GPS do usuário
 * 2. última visita concluída com coords
 * 3. visita anterior com coords
 * 4. origem inicial do roteiro
 */
export function resolveRouteOrigin(params: {
  userLocation?: LatLng | null;
  visits: VisitLike[];
  nextVisit: VisitLike;
  tripOrigin?: LatLng | null;
}): LatLng | null {
  if (params.userLocation) return params.userLocation;

  const lastCompleted = findLastCompletedVisit(params.visits);
  if (
    lastCompleted &&
    typeof lastCompleted.lat === "number" &&
    typeof lastCompleted.lng === "number"
  ) {
    return { lat: lastCompleted.lat, lng: lastCompleted.lng };
  }

  const previous = findPreviousVisit(params.visits, params.nextVisit.id);
  if (
    previous &&
    typeof previous.lat === "number" &&
    typeof previous.lng === "number"
  ) {
    return { lat: previous.lat, lng: previous.lng };
  }

  if (params.tripOrigin) return params.tripOrigin;
  return null;
}

export function visitHasCoordinates(visit: VisitLike): boolean {
  if (visit.google_place_id?.trim()) return true;
  return (
    typeof visit.lat === "number" &&
    typeof visit.lng === "number" &&
    Number.isFinite(visit.lat) &&
    Number.isFinite(visit.lng)
  );
}

export function visitRouteDestination(
  visit: VisitLike
): { placeId: string } | { lat: number; lng: number } | null {
  const pid = visit.google_place_id?.trim();
  if (pid) return { placeId: pid };
  if (
    typeof visit.lat === "number" &&
    typeof visit.lng === "number" &&
    Number.isFinite(visit.lat) &&
    Number.isFinite(visit.lng)
  ) {
    return { lat: visit.lat, lng: visit.lng };
  }
  return null;
}
