import { formatDurationFriendly } from "@/domain/itinerary/duration";
import {
  canEstimateTransferArrival,
  estimateArrivalHHmm,
  estimateDepartHHmm,
  routesModeForTransport,
  transferEndpointHasCoords,
  transportModeHint,
  type TransferEndpoint,
  type TripTransportMode,
} from "@/domain/travel/transportModes";
import { fetchTravelRoutes } from "@/lib/googleRoutes";

export async function estimateTransferTimes(params: {
  mode: TripTransportMode;
  origin: TransferEndpoint | null;
  destination: TransferEndpoint | null;
  depart: string;
  arrive: string;
}): Promise<{ depart: string; arrive: string; note: string }> {
  const depart = params.depart.trim();
  const arrive = params.arrive.trim();
  if (!canEstimateTransferArrival(params.mode)) {
    return { depart, arrive, note: transportModeHint(params.mode) };
  }
  if (
    !params.origin ||
    !params.destination ||
    !transferEndpointHasCoords(params.origin) ||
    !transferEndpointHasCoords(params.destination)
  ) {
    return {
      depart,
      arrive,
      note: "Origem e destino precisam de coordenadas para estimar.",
    };
  }
  if (!depart && !arrive) {
    return {
      depart,
      arrive,
      note: "Preencha a saída ou a chegada; o botão calcula o outro.",
    };
  }
  const routesMode = routesModeForTransport(params.mode);
  if (!routesMode) {
    return { depart, arrive, note: transportModeHint(params.mode) };
  }
  const dest = params.destination.place_id
    ? { placeId: params.destination.place_id }
    : { lat: params.destination.lat!, lng: params.destination.lng! };
  const legs = await fetchTravelRoutes({
    origin: { lat: params.origin.lat!, lng: params.origin.lng! },
    destination: dest,
    modes: [routesMode],
  });
  const leg = legs.find((row) => row.mode === routesMode) ?? legs[0];
  if (!leg?.available || leg.durationSeconds == null) {
    return {
      depart,
      arrive,
      note: "Não foi possível estimar este trecho. Informe os horários manualmente.",
    };
  }
  const durationLabel = formatDurationFriendly(leg.durationSeconds);
  if (depart) {
    const arrival = estimateArrivalHHmm(depart, leg.durationSeconds);
    if (!arrival) {
      return {
        depart,
        arrive,
        note: "Informe um horário de saída válido (ex: 09:30).",
      };
    }
    return {
      depart,
      arrive: arrival,
      note: `~${durationLabel} de viagem → chegada ${arrival}.`,
    };
  }
  const departEst = estimateDepartHHmm(arrive, leg.durationSeconds);
  if (!departEst) {
    return {
      depart,
      arrive,
      note: "Informe um horário de chegada válido (ex: 14:30).",
    };
  }
  return {
    depart: departEst,
    arrive,
    note: `~${durationLabel} de viagem → saída ${departEst}.`,
  };
}
