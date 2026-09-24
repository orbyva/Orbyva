/**
 * Deslocamentos que a Orb grava ao criar uma viagem multi-parada.
 *
 * Espelha a convenção do app (`listDayPairConnectors`): a atividade de transporte
 * entre cidades fica no **dia de chegada**. Ida/volta casa usam o 1º e o último dia.
 */

import {
  estimateArrivalHHmm,
  estimateDepartHHmm,
} from "@/domain/travel/transportModes";

export type OrbTripStopInput = {
  name: string;
  start_date: string;
  end_date: string;
  sort_order: number;
};

export type OrbTransferSpec = {
  /** Dia do roteiro (YYYY-MM-DD) onde a atividade é criada. */
  dayDate: string;
  originLabel: string;
  destinationLabel: string;
  /** HH:MM conhecido, se houver. */
  departHint: string | null;
  arriveHint: string | null;
  kind: "outbound" | "inter" | "return";
};

/**
 * Monta os trechos: casa→1ª, entre paradas consecutivas, última→casa.
 * Horários finais (com duração de rota) vêm de `resolveTransferTimes`.
 */
export function listOrbTripTransfers(params: {
  originLabel: string | null;
  outboundDepart: string | null;
  returnDepart?: string | null;
  /** Saída padrão do trecho entre cidades quando a pessoa não disse (ex.: 08:00). */
  interStopDepart: string | null;
  stops: OrbTripStopInput[];
}): OrbTransferSpec[] {
  const stops = params.stops.filter((s) => s.name.trim());
  if (stops.length === 0) return [];

  const out: OrbTransferSpec[] = [];
  const origin = params.originLabel?.trim() || null;

  if (origin) {
    const first = stops[0]!;
    out.push({
      kind: "outbound",
      dayDate: first.start_date,
      originLabel: origin,
      destinationLabel: first.name.trim(),
      departHint: params.outboundDepart?.trim() || null,
      arriveHint: null,
    });
  }

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]!;
    const to = stops[i + 1]!;
    out.push({
      kind: "inter",
      dayDate: to.start_date,
      originLabel: from.name.trim(),
      destinationLabel: to.name.trim(),
      departHint: params.interStopDepart?.trim() || null,
      arriveHint: null,
    });
  }

  if (origin && stops.length >= 1) {
    const last = stops[stops.length - 1]!;
    out.push({
      kind: "return",
      dayDate: last.end_date,
      originLabel: last.name.trim(),
      destinationLabel: origin,
      departHint: params.returnDepart?.trim() || null,
      arriveHint: null,
    });
  }

  return out;
}

/**
 * Preenche saída/chegada a partir do que já se sabe + duração da rota (segundos).
 * Se só há duração, usa `defaultDepart` como âncora de saída.
 */
export function resolveTransferTimes(params: {
  departHint: string | null;
  arriveHint: string | null;
  durationSeconds: number | null;
  defaultDepart?: string;
}): { activity_time: string | null; arrival_time: string | null } {
  const depart = params.departHint?.trim() || null;
  const arrive = params.arriveHint?.trim() || null;
  const duration = params.durationSeconds;
  const hasDuration =
    typeof duration === "number" && Number.isFinite(duration) && duration >= 0;

  if (hasDuration && depart && !arrive) {
    return {
      activity_time: depart,
      arrival_time: estimateArrivalHHmm(depart, duration!),
    };
  }
  if (hasDuration && arrive && !depart) {
    return {
      activity_time: estimateDepartHHmm(arrive, duration!),
      arrival_time: arrive,
    };
  }
  if (hasDuration && !depart && !arrive) {
    const fallback = params.defaultDepart?.trim() || "08:00";
    return {
      activity_time: fallback,
      arrival_time: estimateArrivalHHmm(fallback, duration!),
    };
  }
  return { activity_time: depart, arrival_time: arrive };
}
