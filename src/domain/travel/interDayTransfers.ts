import { stopForDate } from "@/domain/travel/tripStops";
import type {
  TripItineraryActivity,
  TripItineraryDay,
  TripStop,
} from "@/types/travel";

export type DayPairConnector = {
  fromDay: TripItineraryDay;
  toDay: TripItineraryDay;
  fromStopName: string | null;
  toStopName: string | null;
  /** Coordenadas / place da parada de saída (dia anterior). */
  fromStop: {
    lat: number | null;
    lng: number | null;
    place_id: string | null;
  } | null;
  /** Coordenadas / place da parada de chegada. */
  toStop: {
    lat: number | null;
    lng: number | null;
    place_id: string | null;
  } | null;
  /** Título sugerido (cidades ou “Deslocamento”). */
  suggestedTitle: string;
  /** Deslocamento já cadastrado no dia de chegada. */
  activity: TripItineraryActivity | null;
  /** Parada muda entre os dias. */
  cityChanged: boolean;
};

function stopKey(
  stop: Pick<TripStop, "name" | "place_id" | "lat" | "lng"> | null
): string | null {
  if (!stop) return null;
  if (stop.place_id?.trim()) return `id:${stop.place_id.trim()}`;
  if (
    typeof stop.lat === "number" &&
    typeof stop.lng === "number" &&
    Number.isFinite(stop.lat) &&
    Number.isFinite(stop.lng)
  ) {
    return `geo:${stop.lat.toFixed(4)},${stop.lng.toFixed(4)}`;
  }
  const name = stop.name.trim().toLowerCase();
  return name ? `name:${name}` : null;
}

/** Título canônico do deslocamento entre duas paradas. */
export function transferTitle(fromName: string, toName: string): string {
  return `${fromName.trim()} → ${toName.trim()}`;
}

export function isTransportActivity(
  act: Pick<TripItineraryActivity, "category">
): boolean {
  return (act.category ?? "").toLowerCase() === "transport";
}

/** Primeira atividade de deslocamento do dia (para rota / par de dias). */
export function findTransferActivity(
  day: TripItineraryDay
): TripItineraryActivity | null {
  return (day.activities ?? []).find((a) => isTransportActivity(a)) ?? null;
}

/**
 * Origem/destino heurísticos para estimar volta:
 * parada do dia → parada anterior do roteiro.
 */
export function sameDayTransferRouteEndpoints(
  day: Pick<TripItineraryDay, "date">,
  stops: TripStop[]
): {
  origin: { lat: number; lng: number };
  destination: { placeId: string } | { lat: number; lng: number };
} | null {
  if (!day.date || stops.length === 0) return null;
  const current = stopForDate(stops, day.date);
  if (
    !current ||
    typeof current.lat !== "number" ||
    typeof current.lng !== "number" ||
    !Number.isFinite(current.lat) ||
    !Number.isFinite(current.lng)
  ) {
    return null;
  }
  const ordered = [...stops].sort((a, b) => a.sort_order - b.sort_order);
  const idx = ordered.findIndex((s) => s === current);
  const prev = idx > 0 ? ordered[idx - 1] : null;
  if (!prev) return null;
  const origin = { lat: current.lat, lng: current.lng };
  const placeId = prev.place_id?.trim();
  if (placeId) return { origin, destination: { placeId } };
  if (
    typeof prev.lat !== "number" ||
    typeof prev.lng !== "number" ||
    !Number.isFinite(prev.lat) ||
    !Number.isFinite(prev.lng)
  ) {
    return null;
  }
  return { origin, destination: { lat: prev.lat, lng: prev.lng } };
}

/**
 * Pares consecutivos do roteiro, sempre um slot de deslocamento entre eles.
 * Atividade fica no dia de chegada (`toDay`).
 */
export function listDayPairConnectors(
  days: TripItineraryDay[],
  stops: TripStop[]
): DayPairConnector[] {
  if (days.length < 2) return [];
  const ordered = [...days].sort((a, b) => a.day_number - b.day_number);
  const out: DayPairConnector[] = [];

  for (let i = 0; i < ordered.length - 1; i++) {
    const fromDay = ordered[i]!;
    const toDay = ordered[i + 1]!;

    const fromStop =
      fromDay.date && stops.length > 0
        ? stopForDate(stops, fromDay.date)
        : null;
    const toStop =
      toDay.date && stops.length > 0 ? stopForDate(stops, toDay.date) : null;

    const fromStopName = fromStop?.name?.trim() || null;
    const toStopName = toStop?.name?.trim() || null;
    const fromKey = stopKey(fromStop);
    const toKey = stopKey(toStop);
    const cityChanged = Boolean(
      fromKey && toKey && fromKey !== toKey && fromStopName && toStopName
    );

    const suggestedTitle = cityChanged
      ? transferTitle(fromStopName!, toStopName!)
      : fromStopName && toStopName && fromStopName === toStopName
        ? `Deslocamento`
        : `Deslocamento · Dia ${fromDay.day_number} → ${toDay.day_number}`;

    out.push({
      fromDay,
      toDay,
      fromStopName,
      toStopName,
      fromStop: fromStop
        ? {
            lat: typeof fromStop.lat === "number" ? fromStop.lat : null,
            lng: typeof fromStop.lng === "number" ? fromStop.lng : null,
            place_id: fromStop.place_id ?? null,
          }
        : null,
      toStop: toStop
        ? {
            lat: typeof toStop.lat === "number" ? toStop.lat : null,
            lng: typeof toStop.lng === "number" ? toStop.lng : null,
            place_id: toStop.place_id ?? null,
          }
        : null,
      suggestedTitle,
      activity: findTransferActivity(toDay),
      cityChanged,
    });
  }

  return out;
}

/** Origem/destino para estimar chegada via Routes (quando houver coords). */
export function transferRouteEndpoints(connector: DayPairConnector): {
  origin: { lat: number; lng: number };
  destination: { placeId: string } | { lat: number; lng: number };
} | null {
  const from = connector.fromStop;
  const to = connector.toStop;
  if (
    from?.lat == null ||
    from?.lng == null ||
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng)
  ) {
    return null;
  }
  const origin = { lat: from.lat, lng: from.lng };
  const placeId = to?.place_id?.trim();
  if (placeId) {
    return { origin, destination: { placeId } };
  }
  if (
    to?.lat == null ||
    to?.lng == null ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng)
  ) {
    return null;
  }
  return { origin, destination: { lat: to.lat, lng: to.lng } };
}

/** Texto de planejamento a partir dos horários do deslocamento. */
export function transferPlanningHint(
  activity: Pick<TripItineraryActivity, "activity_time" | "arrival_time"> | null
): string | null {
  if (!activity) return null;
  const depart = activity.activity_time?.trim() || null;
  const arrive = activity.arrival_time?.trim() || null;
  if (arrive && depart) {
    return `Saída ${depart} · chegada ${arrive}, planeje o próximo dia a partir da chegada`;
  }
  if (arrive) {
    return `Chegada ${arrive}, planeje o dia a partir daí`;
  }
  if (depart) {
    return `Saída ${depart}, reserve tempo no dia anterior`;
  }
  return null;
}

export type TransferTimeConflict = {
  message: string;
};

export type LocationHint = {
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
};

function coordsNear(
  a: { lat?: number | null; lng?: number | null },
  b: { lat?: number | null; lng?: number | null },
  deg = 0.5
): boolean {
  const aLat = a.lat;
  const aLng = a.lng;
  const bLat = b.lat;
  const bLng = b.lng;
  if (
    typeof aLat !== "number" ||
    typeof aLng !== "number" ||
    typeof bLat !== "number" ||
    typeof bLng !== "number" ||
    !Number.isFinite(aLat) ||
    !Number.isFinite(aLng) ||
    !Number.isFinite(bLat) ||
    !Number.isFinite(bLng)
  ) {
    return false;
  }
  return Math.abs(aLat - bLat) < deg && Math.abs(aLng - bLng) < deg;
}

function labelsRelated(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = (a ?? "").trim().toLowerCase();
  const nb = (b ?? "").trim().toLowerCase();
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * Deslocamento chega no local do dia/visita (ida), não volta para casa.
 * Sem coords/rótulo suficientes → false.
 */
export function transferArrivesAtLocation(
  transfer: {
    origin_label?: string | null;
    origin_lat?: number | null;
    origin_lng?: number | null;
    destination_label?: string | null;
    destination_lat?: number | null;
    destination_lng?: number | null;
  },
  location: LocationHint | null | undefined
): boolean {
  if (!location) return false;
  const destNear =
    coordsNear(
      { lat: transfer.destination_lat, lng: transfer.destination_lng },
      location
    ) || labelsRelated(transfer.destination_label, location.label);
  if (!destNear) return false;
  const originNear =
    coordsNear(
      { lat: transfer.origin_lat, lng: transfer.origin_lng },
      location
    ) || labelsRelated(transfer.origin_label, location.label);
  return !originNear;
}

/**
 * Saída do local do dia (volta / seguir viagem). Com endpoints vazios → false.
 */
export function transferLeavesLocation(
  transfer: {
    origin_label?: string | null;
    origin_lat?: number | null;
    origin_lng?: number | null;
    destination_label?: string | null;
    destination_lat?: number | null;
    destination_lng?: number | null;
  },
  location: LocationHint | null | undefined
): boolean {
  if (!location) return false;
  const originNear =
    coordsNear(
      { lat: transfer.origin_lat, lng: transfer.origin_lng },
      location
    ) || labelsRelated(transfer.origin_label, location.label);
  if (!originNear) return false;
  const destNear =
    coordsNear(
      { lat: transfer.destination_lat, lng: transfer.destination_lng },
      location
    ) || labelsRelated(transfer.destination_label, location.label);
  return !destNear;
}

function transferEndpointsFromActivity(act: TripItineraryActivity): {
  origin_label: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_label: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
} {
  const fromTitle = (() => {
    const parts = (act.title ?? "")
      .split("→")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length !== 2) return null;
    return { originLabel: parts[0]!, destinationLabel: parts[1]! };
  })();
  return {
    origin_label: act.origin_label?.trim() || fromTitle?.originLabel || null,
    origin_lat: act.origin_lat ?? null,
    origin_lng: act.origin_lng ?? null,
    destination_label:
      act.destination_label?.trim() || fromTitle?.destinationLabel || null,
    destination_lat: act.destination_lat ?? null,
    destination_lng: act.destination_lng ?? null,
  };
}

/** Minutos desde meia-noite; `null` se vazio ou inválido. */
export function parseTimeToMinutes(
  hhmm: string | null | undefined
): number | null {
  const raw = hhmm?.trim();
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

function orderedDays(days: TripItineraryDay[]): TripItineraryDay[] {
  return [...days].sort((a, b) => a.day_number - b.day_number);
}

/**
 * Chegada ≤ saída no relógio ⇒ atravessa meia-noite (pernoite).
 * `null` se faltar algum horário.
 */
export function isOvernightTransferTimes(
  departHHmm: string | null | undefined,
  arriveHHmm: string | null | undefined
): boolean | null {
  const depart = parseTimeToMinutes(departHHmm);
  const arrive = parseTimeToMinutes(arriveHHmm);
  if (depart == null || arrive == null) return null;
  return arrive <= depart;
}

/**
 * Visita com horário não pode cair no intervalo do deslocamento,
 * nem antes da chegada quando o deslocamento é de ida para o local.
 * - Mesmo calendário: [saída, chegada); se ida ao local, também horário < chegada.
 * - Pernoite: no dia da atividade, horário < chegada;
 *   no dia anterior, horário ≥ saída.
 * Sem horário na visita → permitido.
 */
export function visitTimeConflictsWithTransfers(params: {
  dayId: string;
  activityTime: string | null | undefined;
  days: TripItineraryDay[];
  excludeActivityId?: string | null;
  /** Parada do dia / lugar da visita, para saber se o deslocamento é ida. */
  atLocation?: LocationHint | null;
}): TransferTimeConflict | null {
  const time = parseTimeToMinutes(params.activityTime);
  if (time == null) return null;

  const ordered = orderedDays(params.days);
  const idx = ordered.findIndex((d) => d.id === params.dayId);
  if (idx < 0) return null;
  const day = ordered[idx]!;
  const dayTransfers = (day.activities ?? []).filter(
    (a) => isTransportActivity(a) && a.id !== params.excludeActivityId
  );

  for (const act of day.activities ?? []) {
    if (!isTransportActivity(act)) continue;
    if (act.id === params.excludeActivityId) continue;
    const depart = parseTimeToMinutes(act.activity_time);
    const arrive = parseTimeToMinutes(act.arrival_time);
    const departLabel = act.activity_time?.trim()?.slice(0, 5) || null;
    const arriveLabel = act.arrival_time?.trim()?.slice(0, 5) || null;
    const overnight = isOvernightTransferTimes(
      act.activity_time,
      act.arrival_time
    );
    const endpoints = transferEndpointsFromActivity(act);
    // Só ignora “antes da chegada” se for volta/saída do local do dia.
    const leaving = transferLeavesLocation(endpoints, params.atLocation);
    // Sem local do dia: só assume ida se houver um único deslocamento.
    const blockBeforeArrive =
      arrive != null &&
      Boolean(arriveLabel) &&
      !leaving &&
      (params.atLocation != null || dayTransfers.length === 1);

    if (overnight === false && depart != null && arrive != null) {
      if (time >= depart && time < arrive) {
        return {
          message: `Horário dentro do deslocamento “${act.title}” (${departLabel}–${arriveLabel}).`,
        };
      }
      if (blockBeforeArrive && time < arrive) {
        return {
          message: `Você só chega às ${arriveLabel} (“${act.title}”). Use ${arriveLabel} ou depois.`,
        };
      }
    } else if (overnight === true && arrive != null && arriveLabel) {
      if (time < arrive) {
        return {
          message: `Horário dentro do deslocamento (chegada ${arriveLabel}). Use ${arriveLabel} ou depois.`,
        };
      }
    } else if (
      arrive != null &&
      arriveLabel &&
      depart == null &&
      time < arrive
    ) {
      return {
        message: `Horário dentro do deslocamento (chegada ${arriveLabel}). Use ${arriveLabel} ou depois.`,
      };
    } else if (blockBeforeArrive && arrive != null && arriveLabel && time < arrive) {
      return {
        message: `Você só chega às ${arriveLabel} (“${act.title}”). Use ${arriveLabel} ou depois.`,
      };
    }
  }

  const next = ordered[idx + 1];
  if (next) {
    for (const act of next.activities ?? []) {
      if (!isTransportActivity(act)) continue;
      if (act.id === params.excludeActivityId) continue;
      if (
        isOvernightTransferTimes(act.activity_time, act.arrival_time) !== true
      ) {
        continue;
      }
      const depart = parseTimeToMinutes(act.activity_time);
      const departLabel = act.activity_time?.trim()?.slice(0, 5);
      if (depart != null && departLabel && time >= depart) {
        return {
          message: `Horário dentro do deslocamento (saída ${departLabel}). Escolha um horário antes de ${departLabel}.`,
        };
      }
    }
  }

  return null;
}

/**
 * Ao salvar deslocamento: visitas existentes não podem estar no intervalo
 * inferido pelos horários (mesmo dia ou pernoite).
 * Se `arrivesAtDayLocation`, também bloqueia visitas antes da chegada.
 */
export function transferTimesConflictWithVisits(params: {
  dayId: string;
  departTime: string | null | undefined;
  arriveTime: string | null | undefined;
  days: TripItineraryDay[];
  excludeActivityId?: string | null;
  /** Ida para a parada do dia: visitas com horário < chegada conflitam. */
  arrivesAtDayLocation?: boolean;
}): TransferTimeConflict | null {
  const ordered = orderedDays(params.days);
  const idx = ordered.findIndex((d) => d.id === params.dayId);
  if (idx < 0) return null;
  const day = ordered[idx]!;
  const prevDay = idx > 0 ? ordered[idx - 1]! : null;

  const depart = parseTimeToMinutes(params.departTime);
  const arrive = parseTimeToMinutes(params.arriveTime);
  const departLabel = params.departTime?.trim()?.slice(0, 5) || null;
  const arriveLabel = params.arriveTime?.trim()?.slice(0, 5) || null;
  const overnight = isOvernightTransferTimes(
    params.departTime,
    params.arriveTime
  );

  const visitConflict = (
    acts: TripItineraryActivity[],
    pred: (t: number) => boolean,
    message: (act: TripItineraryActivity) => string
  ): TransferTimeConflict | null => {
    for (const act of acts) {
      if (isTransportActivity(act)) continue;
      if (act.id === params.excludeActivityId) continue;
      const t = parseTimeToMinutes(act.activity_time);
      if (t != null && pred(t)) {
        return { message: message(act) };
      }
    }
    return null;
  };

  if (overnight === false && arrive != null && arriveLabel) {
    if (params.arrivesAtDayLocation) {
      return visitConflict(
        day.activities ?? [],
        (t) => t < arrive,
        (act) =>
          `“${act.title}” (${act.activity_time}) é antes da chegada ${arriveLabel}. Ajuste o horário do evento.`
      );
    }
    if (depart != null && departLabel) {
      return visitConflict(
        day.activities ?? [],
        (t) => t >= depart && t < arrive,
        (act) =>
          `“${act.title}” (${act.activity_time}) conflita com o deslocamento ${departLabel}–${arriveLabel}.`
      );
    }
  }

  if (overnight === true) {
    if (arrive != null && arriveLabel) {
      const hit = visitConflict(
        day.activities ?? [],
        (t) => t < arrive,
        (act) =>
          `“${act.title}” (${act.activity_time}) no dia ${day.day_number} conflita com a chegada ${arriveLabel}.`
      );
      if (hit) return hit;
    }
    if (prevDay && depart != null && departLabel) {
      return visitConflict(
        prevDay.activities ?? [],
        (t) => t >= depart,
        (act) =>
          `“${act.title}” (${act.activity_time}) no dia ${prevDay.day_number} conflita com a saída ${departLabel}.`
      );
    }
  }

  return null;
}

/** @deprecated Use listDayPairConnectors */
export function listInterDayTransfers(
  days: TripItineraryDay[],
  stops: TripStop[]
) {
  return listDayPairConnectors(days, stops).filter((c) => c.cityChanged);
}

/** @deprecated */
export function suggestedTransferTitleForDay(
  day: TripItineraryDay,
  days: TripItineraryDay[],
  stops: TripStop[]
): string | null {
  return (
    listDayPairConnectors(days, stops).find((c) => c.toDay.id === day.id)
      ?.suggestedTitle ?? null
  );
}
