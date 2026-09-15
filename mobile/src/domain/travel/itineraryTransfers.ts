import { transferEndpointsTitle, type TransferEndpoint } from "@/domain/travel/transportModes";

export type PlannedTransferRole = "outbound" | "leg" | "return";

export type PlannedTransfer = {
  date: string;
  origin: TransferEndpoint;
  destination: TransferEndpoint;
  role: PlannedTransferRole;
};

export type StopLike = {
  name: string;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  start_date: string;
  end_date: string;
  sort_order?: number;
};

export type TransferActivityLike = {
  id: string;
  day_id: string;
  title: string;
  category?: string | null;
  sort_order?: number | null;
  activity_time?: string | null;
  arrival_time?: string | null;
  origin_label?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  origin_place_id?: string | null;
  destination_label?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  destination_place_id?: string | null;
};

export type TransferDayLike = {
  id: string;
  date?: string | null;
  activities?: TransferActivityLike[] | null;
};

export type TransferActivityDraft = {
  day_id: string;
  date: string;
  title: string;
  category: "transport";
  transport_mode: string | null;
  sort_order: number;
  activity_time: string | null;
  arrival_time: string | null;
  origin_label: string;
  origin_lat: number | null;
  origin_lng: number | null;
  origin_place_id: string | null;
  destination_label: string;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_place_id: string | null;
};

export type TransferActivitySyncPlan = {
  create: TransferActivityDraft[];
  update: Array<TransferActivityDraft & { id: string }>;
  deleteIds: string[];
};

function eachIsoDate(startDate: string, endDate: string): string[] {
  const start = startDate.slice(0, 10);
  const end = endDate.slice(0, 10);
  const cur = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime()) || last < cur) {
    return [];
  }
  const out: string[] = [];
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function endpointKey(
  endpoint: {
    name?: string | null;
    label?: string | null;
    place_id?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null | undefined
): string | null {
  if (!endpoint) return null;
  const placeId = endpoint.place_id?.trim();
  if (placeId) return `id:${placeId}`;
  if (
    typeof endpoint.lat === "number" &&
    typeof endpoint.lng === "number" &&
    Number.isFinite(endpoint.lat) &&
    Number.isFinite(endpoint.lng)
  ) {
    return `geo:${endpoint.lat.toFixed(4)},${endpoint.lng.toFixed(4)}`;
  }
  const name = (endpoint.label ?? endpoint.name ?? "").trim().toLowerCase();
  return name ? `name:${name}` : null;
}

export function sameTransferEndpoint(
  a: Parameters<typeof endpointKey>[0],
  b: Parameters<typeof endpointKey>[0]
): boolean {
  const ka = endpointKey(a);
  const kb = endpointKey(b);
  return Boolean(ka && kb && ka === kb);
}

export function endpointFromStop(stop: StopLike): TransferEndpoint {
  return {
    label: stop.name.trim(),
    lat: typeof stop.lat === "number" && Number.isFinite(stop.lat) ? stop.lat : null,
    lng: typeof stop.lng === "number" && Number.isFinite(stop.lng) ? stop.lng : null,
    place_id: stop.place_id?.trim() || null,
  };
}

/**
 * Cidade de hospedagem no dia: quem continua depois, senão quem já estava,
 * senão a parada que cobre o dia.
 */
export function lodgingStopForDate<T extends StopLike>(
  stops: T[],
  date: string
): T | null {
  const day = date.slice(0, 10);
  const covering = stops.filter(
    (s) => s.name.trim() && s.start_date <= day && day <= s.end_date
  );
  if (covering.length === 0) return null;

  const continuing = covering.filter((s) => s.end_date > day);
  if (continuing.length > 0) {
    return [...continuing].sort((a, b) => {
      if (a.start_date !== b.start_date) {
        return a.start_date.localeCompare(b.start_date);
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    })[0] ?? null;
  }

  const ongoing = covering.filter((s) => s.start_date < day);
  if (ongoing.length > 0) {
    return (
      [...ongoing].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))[0] ??
      null
    );
  }

  return (
    [...covering].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))[0] ??
    null
  );
}

function isTransportActivity(act: TransferActivityLike): boolean {
  return (
    (act.category ?? "").toLowerCase() === "transport" ||
    Boolean(act.title?.includes("→"))
  );
}

function endpointsFromTitle(title: string): {
  originLabel: string;
  destinationLabel: string;
} | null {
  const parts = title
    .split("→")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;
  return { originLabel: parts[0]!, destinationLabel: parts[1]! };
}

function activityEndpoints(act: TransferActivityLike): {
  origin: TransferEndpoint;
  destination: TransferEndpoint;
} {
  const fromTitle = endpointsFromTitle(act.title ?? "");
  return {
    origin: {
      label: act.origin_label?.trim() || fromTitle?.originLabel || "",
      lat: act.origin_lat ?? null,
      lng: act.origin_lng ?? null,
      place_id: act.origin_place_id ?? null,
    },
    destination: {
      label: act.destination_label?.trim() || fromTitle?.destinationLabel || "",
      lat: act.destination_lat ?? null,
      lng: act.destination_lng ?? null,
      place_id: act.destination_place_id ?? null,
    },
  };
}

function roleForLeg(
  origin: TransferEndpoint,
  destination: TransferEndpoint,
  home: TransferEndpoint | null
): PlannedTransferRole {
  if (home && sameTransferEndpoint(origin, home)) return "outbound";
  if (home && sameTransferEndpoint(destination, home)) return "return";
  return "leg";
}

function laterLodgingStop(
  stops: StopLike[],
  dates: string[],
  afterDate: string
): StopLike | null {
  for (const date of dates) {
    if (date <= afterDate) continue;
    const lodging = lodgingStopForDate(stops, date);
    if (lodging) return lodging;
  }
  return null;
}

/**
 * Trechos do roteiro a partir das paradas.
 * Passeio no meio da viagem volta para a hospedagem dos dias seguintes;
 * origem da viagem só entra no encerramento.
 */
export function planItineraryTransfers(params: {
  stops: StopLike[];
  startDate: string;
  endDate: string;
  home?: TransferEndpoint | null;
}): PlannedTransfer[] {
  const named = params.stops.filter((s) => s.name.trim());
  const dates = eachIsoDate(params.startDate, params.endDate);
  const home = params.home?.label.trim()
    ? {
        label: params.home.label.trim(),
        lat: params.home.lat ?? null,
        lng: params.home.lng ?? null,
        place_id: params.home.place_id ?? null,
      }
    : null;

  let current: TransferEndpoint | null = home;
  const planned: PlannedTransfer[] = [];

  function emit(
    date: string,
    origin: TransferEndpoint | null,
    destination: TransferEndpoint | null
  ) {
    if (!origin?.label.trim() || !destination?.label.trim()) return;
    if (sameTransferEndpoint(origin, destination)) return;
    planned.push({
      date,
      origin,
      destination,
      role: roleForLeg(origin, destination, home),
    });
  }

  for (const date of dates) {
    const lodging = lodgingStopForDate(named, date);
    const lodgingEp = lodging ? endpointFromStop(lodging) : null;
    const lodgingKey = lodgingEp ? endpointKey(lodgingEp) : null;
    const excursions = named
      .filter(
        (s) =>
          s.start_date === date &&
          s.end_date === date &&
          endpointKey(endpointFromStop(s)) !== lodgingKey
      )
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    if (lodgingEp && current && !sameTransferEndpoint(current, lodgingEp)) {
      emit(date, current, lodgingEp);
      current = lodgingEp;
    } else if (lodgingEp && !current) {
      current = lodgingEp;
    }

    for (const excursion of excursions) {
      const excursionEp = endpointFromStop(excursion);
      if (current && !sameTransferEndpoint(current, excursionEp)) {
        emit(date, current, excursionEp);
      }
      current = excursionEp;
    }

    if (lodgingEp && current && !sameTransferEndpoint(current, lodgingEp)) {
      const lodgingContinues = Boolean(lodging && lodging.end_date > date);
      const nextStay = laterLodgingStop(named, dates, date);
      if (lodgingContinues) {
        emit(date, current, lodgingEp);
        current = lodgingEp;
      } else if (
        nextStay &&
        !sameTransferEndpoint(current, endpointFromStop(nextStay))
      ) {
        // O próximo dia emite a chegada na hospedagem seguinte.
      }
    }
  }

  if (home && current && !sameTransferEndpoint(current, home)) {
    emit(params.endDate.slice(0, 10), current, home);
  }

  return planned;
}

function emptyToNull(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

function draftFromPlanned(params: {
  planned: PlannedTransfer;
  dayId: string;
  sortOrder: number;
  mode: string | null;
  activityTime: string | null;
  arrivalTime: string | null;
}): TransferActivityDraft {
  const { planned, dayId, sortOrder, mode, activityTime, arrivalTime } = params;
  return {
    day_id: dayId,
    date: planned.date,
    title: transferEndpointsTitle(planned.origin.label, planned.destination.label),
    category: "transport",
    transport_mode: mode,
    sort_order: sortOrder,
    activity_time: activityTime,
    arrival_time: arrivalTime,
    origin_label: planned.origin.label,
    origin_lat: planned.origin.lat,
    origin_lng: planned.origin.lng,
    origin_place_id: planned.origin.place_id,
    destination_label: planned.destination.label,
    destination_lat: planned.destination.lat,
    destination_lng: planned.destination.lng,
    destination_place_id: planned.destination.place_id,
  };
}

/**
 * Encaixa trechos planejados nas atividades já salvas (ida/volta e passeio).
 * Deslocamento extra para a origem da viagem, fora do encerramento, sai.
 */
export function planTransferActivitySync(params: {
  planned: PlannedTransfer[];
  days: TransferDayLike[];
  home?: TransferEndpoint | null;
  mode?: string | null;
  outboundTimes?: { depart: string; arrive: string };
  returnTimes?: { depart: string; arrive: string };
  knownOutboundId?: string | null;
  knownReturnId?: string | null;
}): TransferActivitySyncPlan {
  const daysByDate = new Map<string, TransferDayLike>();
  for (const day of params.days) {
    const date = day.date?.slice(0, 10);
    if (date && !daysByDate.has(date)) daysByDate.set(date, day);
  }

  const transports: Array<TransferActivityLike & { dayDate: string | null }> = [];
  for (const day of params.days) {
    for (const act of day.activities ?? []) {
      if (!isTransportActivity(act)) continue;
      transports.push({ ...act, dayDate: day.date?.slice(0, 10) ?? null });
    }
  }

  const used = new Set<string>();
  const take = (
    pred: (act: (typeof transports)[number]) => boolean
  ): TransferActivityLike | null => {
    const hit = transports.find((act) => !used.has(act.id) && pred(act));
    if (!hit) return null;
    used.add(hit.id);
    return hit;
  };

  const home = params.home?.label.trim() ? params.home : null;
  const sortOnDate = new Map<string, number>();
  const create: TransferActivityDraft[] = [];
  const update: Array<TransferActivityDraft & { id: string }> = [];

  for (const planned of params.planned) {
    const day = daysByDate.get(planned.date);
    if (!day) continue;

    const preferredId =
      planned.role === "outbound"
        ? params.knownOutboundId
        : planned.role === "return"
          ? params.knownReturnId
          : null;

    let match: TransferActivityLike | null = null;
    if (preferredId) {
      const preferred = transports.find(
        (act) => act.id === preferredId && !used.has(act.id)
      );
      if (preferred) {
        used.add(preferred.id);
        match = preferred;
      }
    }
    if (!match) {
      match = take(
        (act) =>
          act.day_id === day.id &&
          sameTransferEndpoint(activityEndpoints(act).origin, planned.origin) &&
          sameTransferEndpoint(
            activityEndpoints(act).destination,
            planned.destination
          )
      );
    }
    if (!match) {
      match = take(
        (act) =>
          act.day_id === day.id &&
          sameTransferEndpoint(activityEndpoints(act).origin, planned.origin)
      );
    }
    if (!match) {
      match = take(
        (act) =>
          sameTransferEndpoint(activityEndpoints(act).origin, planned.origin) &&
          sameTransferEndpoint(
            activityEndpoints(act).destination,
            planned.destination
          )
      );
    }
    if (!match && planned.role === "return" && home) {
      match = take((act) =>
        sameTransferEndpoint(activityEndpoints(act).destination, home)
      );
    }
    if (!match && planned.role === "outbound" && home) {
      match = take((act) =>
        sameTransferEndpoint(activityEndpoints(act).origin, home)
      );
    }

    const nextSort = sortOnDate.get(planned.date) ?? 0;
    sortOnDate.set(planned.date, nextSort + 1);

    const existingTimes = match
      ? {
          activity_time: match.activity_time ?? null,
          arrival_time: match.arrival_time ?? null,
        }
      : { activity_time: null, arrival_time: null };
    const formTimes =
      planned.role === "outbound"
        ? params.outboundTimes
        : planned.role === "return"
          ? params.returnTimes
          : null;
    const activityTime = formTimes
      ? emptyToNull(formTimes.depart)
      : existingTimes.activity_time;
    const arrivalTime = formTimes
      ? emptyToNull(formTimes.arrive)
      : existingTimes.arrival_time;

    const draft = draftFromPlanned({
      planned,
      dayId: day.id,
      sortOrder: nextSort,
      mode: params.mode ?? null,
      activityTime,
      arrivalTime,
    });
    if (match) update.push({ id: match.id, ...draft });
    else create.push(draft);
  }

  const deleteIds: string[] = [];
  if (home) {
    for (const act of transports) {
      if (used.has(act.id)) continue;
      if (sameTransferEndpoint(activityEndpoints(act).destination, home)) {
        deleteIds.push(act.id);
      }
    }
  }

  return { create, update, deleteIds };
}
