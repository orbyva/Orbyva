import { useEffect, useState } from "react";
import { Plus, Shirt, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/MoneyInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { OptionalTimeInput } from "@/components/OptionalTimeInput";
import { FormField, FormFieldRow } from "@/components/FormField";
import {
  FormDialogShell,
  FormFooter,
} from "@/components/FormDialogShell";
import { FormDisclosure, FormSection } from "@/components/FormSection";
import { PlaceCatalogSearch } from "@/components/PlaceCatalogSearch";
import { TripWeatherPackingPanel } from "@/components/TripWeatherPanels";
import {
  createItineraryActivity,
  createTrip,
  deleteItineraryActivity,
  fetchTripItineraryLite,
  fetchTripStops,
  updateItineraryActivity,
  updateTrip,
} from "@/api/travel";
import { TRIP_STATUS_LABELS } from "@/domain/travel";
import {
  endpointFromStop,
  lodgingStopForDate,
  planItineraryTransfers,
  planTransferActivitySync,
} from "@/domain/travel/itineraryTransfers";
import {
  activityTimeToInput,
  findRoundTripTransfers,
  type RoundTripHome,
} from "@/domain/travel/roundTripTransfers";
import {
  draftFromLegacyTrip,
  draftsFromStops,
  emptyStopDraft,
  validateTripStops,
  type TripStopDraft,
} from "@/domain/travel/tripStops";
import {
  canEstimateTransferArrival,
  estimateArrivalHHmm,
  estimateDepartHHmm,
  normalizeTripTransportMode,
  routesModeForTransport,
  transferEndpointHasCoords,
  transportModeHint,
  TRIP_TRANSPORT_MODE_LABELS,
  TRIP_TRANSPORT_MODES,
  type TransferEndpoint,
  type TripTransportMode,
} from "@/domain/travel/transportModes";
import type {
  Trip,
  TripCreateRequest,
  TripItineraryDay,
  TripStatus,
} from "@/types/travel";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { fetchTravelRoutes } from "@/lib/googleRoutes";
import { formatDurationFriendly } from "@/domain/itinerary/visits";
import { cn } from "@/lib/utils";

function emptyTrip(): TripCreateRequest {
  return {
    title: "",
    destination: "",
    destination_lat: null,
    destination_lng: null,
    destination_place_id: null,
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
    budget: null,
    spent: 0,
    notes: "",
    status: "planning",
  };
}

interface TripFormDialogProps {
  /** Aceita TripFull (com itinerary/stops) para evitar refetch no editar. */
  trip?: (Trip & { itinerary?: TripItineraryDay[] }) | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
  trigger?: React.ReactNode;
}

export function TripFormDialog({
  trip,
  open: controlledOpen,
  onOpenChange,
  onSaved,
  trigger,
}: TripFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [form, setForm] = useState<TripCreateRequest>(emptyTrip());
  const [stops, setStops] = useState<TripStopDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPacking, setShowPacking] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [includeRoundTrip, setIncludeRoundTrip] = useState(false);
  const [outboundDepart, setOutboundDepart] = useState("");
  const [outboundArrive, setOutboundArrive] = useState("");
  const [returnDepart, setReturnDepart] = useState("");
  const [returnArrive, setReturnArrive] = useState("");
  const [homeOrigin, setHomeOrigin] = useState<RoundTripHome | null>(null);
  const [outboundActivityId, setOutboundActivityId] = useState<string | null>(
    null
  );
  const [returnActivityId, setReturnActivityId] = useState<string | null>(null);
  const [roundTripMode, setRoundTripMode] =
    useState<TripTransportMode>("car");
  const [estimatingLeg, setEstimatingLeg] = useState<"outbound" | "return" | null>(
    null
  );
  const [outboundEstimateNote, setOutboundEstimateNote] = useState<string | null>(
    null
  );
  const [returnEstimateNote, setReturnEstimateNote] = useState<string | null>(
    null
  );
  const { toast } = useToast();
  const isEditing = !!trip;

  function resetRoundTripForm() {
    setIncludeRoundTrip(false);
    setOutboundDepart("");
    setOutboundArrive("");
    setReturnDepart("");
    setReturnArrive("");
    setHomeOrigin(null);
    setOutboundActivityId(null);
    setReturnActivityId(null);
    setRoundTripMode("car");
    setEstimatingLeg(null);
    setOutboundEstimateNote(null);
    setReturnEstimateNote(null);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      if (trip) {
        setForm({
          title: trip.title,
          destination: trip.destination ?? "",
          destination_lat: trip.destination_lat ?? null,
          destination_lng: trip.destination_lng ?? null,
          destination_place_id: trip.destination_place_id ?? null,
          start_date: trip.start_date,
          end_date: trip.end_date,
          budget: trip.budget ?? null,
          spent: trip.spent ?? 0,
          notes: trip.notes ?? "",
          status: trip.status,
        });
        let loadedStops: TripStopDraft[] = [];
        if (trip.stops && trip.stops.length > 0) {
          loadedStops = draftsFromStops(trip.stops);
        } else {
          try {
            const remote = await fetchTripStops(trip.id, {
              skipAccessCheck: true,
            });
            if (cancelled) return;
            if (remote.length > 0) {
              loadedStops = draftsFromStops(remote);
            } else {
              loadedStops = draftFromLegacyTrip({
                destination: trip.destination,
                destination_lat: trip.destination_lat,
                destination_lng: trip.destination_lng,
                destination_place_id: trip.destination_place_id,
                start_date: trip.start_date,
                end_date: trip.end_date,
              });
            }
          } catch {
            if (cancelled) return;
            loadedStops = draftFromLegacyTrip({
              destination: trip.destination,
              destination_lat: trip.destination_lat,
              destination_lng: trip.destination_lng,
              destination_place_id: trip.destination_place_id,
              start_date: trip.start_date,
              end_date: trip.end_date,
            });
          }
        }
        if (cancelled) return;
        setStops(loadedStops);
        setShowAdvanced(
          Boolean(
            trip.budget ||
              trip.notes?.trim() ||
              trip.status !== "planning"
          )
        );

        const tripOrigin: RoundTripHome | null = trip.origin_label?.trim()
          ? {
              label: trip.origin_label.trim(),
              lat: trip.origin_lat ?? null,
              lng: trip.origin_lng ?? null,
              place_id: null,
            }
          : null;

        try {
          const itinerary =
            trip.itinerary && trip.itinerary.length > 0
              ? trip.itinerary
              : await fetchTripItineraryLite(trip.id);
          if (cancelled) return;
          const first = loadedStops[0];
          const last =
            lodgingStopForDate(loadedStops, trip.end_date) ??
            loadedStops[loadedStops.length - 1];
          const match = findRoundTripTransfers({
            itinerary,
            firstStop: first
              ? {
                  name: first.name,
                  place_id: first.place_id,
                  lat: first.lat,
                  lng: first.lng,
                }
              : null,
            lastStop: last
              ? {
                  name: last.name,
                  place_id: last.place_id,
                  lat: last.lat,
                  lng: last.lng,
                }
              : null,
            tripOrigin,
          });
          const hasRoundTrip = Boolean(match.outbound || match.returnTrip);
          setIncludeRoundTrip(hasRoundTrip);
          setHomeOrigin(match.home);
          setOutboundActivityId(match.outbound?.id ?? null);
          setReturnActivityId(match.returnTrip?.id ?? null);
          setOutboundDepart(activityTimeToInput(match.outbound?.activity_time));
          setOutboundArrive(activityTimeToInput(match.outbound?.arrival_time));
          setReturnDepart(activityTimeToInput(match.returnTrip?.activity_time));
          setReturnArrive(activityTimeToInput(match.returnTrip?.arrival_time));
          setRoundTripMode(
            normalizeTripTransportMode(
              match.outbound?.transport_mode ??
                match.returnTrip?.transport_mode ??
                "car"
            )
          );
          setOutboundEstimateNote(null);
          setReturnEstimateNote(null);
        } catch {
          if (cancelled) return;
          setIncludeRoundTrip(false);
          setHomeOrigin(tripOrigin);
          setOutboundActivityId(null);
          setReturnActivityId(null);
          setOutboundDepart("");
          setOutboundArrive("");
          setReturnDepart("");
          setReturnArrive("");
          setRoundTripMode("car");
          setOutboundEstimateNote(null);
          setReturnEstimateNote(null);
        }
      } else {
        const base = emptyTrip();
        setForm(base);
        setStops([emptyStopDraft(base.start_date, base.end_date, 0)]);
        setShowPacking(false);
        setShowAdvanced(false);
        resetRoundTripForm();
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, trip]);

  function updateStop(key: string, patch: Partial<TripStopDraft>) {
    setStops((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s))
    );
  }

  function addStop() {
    setStops((prev) => [
      ...prev,
      emptyStopDraft(form.start_date, form.end_date, prev.length),
    ]);
  }

  function removeStop(key: string) {
    setStops((prev) =>
      prev.length <= 1 ? prev : prev.filter((s) => s.key !== key)
    );
  }

  const firstStopDraft = stops[0];
  const namedStops = stops.filter((s) => s.name.trim());
  const homeEndpoint: TransferEndpoint | null = homeOrigin?.label.trim()
    ? {
        label: homeOrigin.label.trim(),
        lat: homeOrigin.lat,
        lng: homeOrigin.lng,
        place_id: homeOrigin.place_id,
      }
    : null;
  const plannedTransfers = planItineraryTransfers({
    stops: namedStops,
    startDate: form.start_date,
    endDate: form.end_date,
    home: homeEndpoint,
  });
  const outboundPlanned = plannedTransfers.find((t) => t.role === "outbound");
  const returnPlanned = [...plannedTransfers]
    .reverse()
    .find((t) => t.role === "return");
  const lastLodging = lodgingStopForDate(namedStops, form.end_date);
  const firstEndpoint: TransferEndpoint | null =
    outboundPlanned?.destination ??
    (firstStopDraft?.name.trim()
      ? {
          label: firstStopDraft.name.trim(),
          lat: firstStopDraft.lat ?? null,
          lng: firstStopDraft.lng ?? null,
          place_id: firstStopDraft.place_id ?? null,
        }
      : null);
  const lastEndpoint: TransferEndpoint | null =
    returnPlanned?.origin ??
    (lastLodging ? endpointFromStop(lastLodging) : null);

  const canEstimateMode = canEstimateTransferArrival(roundTripMode);
  const outboundHasRoute =
    transferEndpointHasCoords(homeEndpoint) &&
    transferEndpointHasCoords(firstEndpoint);
  const returnHasRoute =
    transferEndpointHasCoords(lastEndpoint) &&
    transferEndpointHasCoords(homeEndpoint);

  async function fetchLegDurationSeconds(
    origin: TransferEndpoint,
    destination: TransferEndpoint
  ): Promise<number | null> {
    const routesMode = routesModeForTransport(roundTripMode);
    if (!routesMode) return null;
    if (
      !transferEndpointHasCoords(origin) ||
      !transferEndpointHasCoords(destination)
    ) {
      return null;
    }
    const dest = destination.place_id
      ? { placeId: destination.place_id }
      : { lat: destination.lat!, lng: destination.lng! };
    const legs = await fetchTravelRoutes({
      origin: { lat: origin.lat!, lng: origin.lng! },
      destination: dest,
      modes: [routesMode],
    });
    const leg = legs.find((l) => l.mode === routesMode) ?? legs[0];
    if (!leg?.available || leg.durationSeconds == null) return null;
    return leg.durationSeconds;
  }

  async function handleEstimateLeg(leg: "outbound" | "return") {
    if (estimatingLeg) return;
    const isOutbound = leg === "outbound";
    const origin = isOutbound ? homeEndpoint : lastEndpoint;
    const destination = isOutbound ? firstEndpoint : homeEndpoint;
    const depart = isOutbound ? outboundDepart : returnDepart;
    const arrive = isOutbound ? outboundArrive : returnArrive;
    const setNote = isOutbound
      ? setOutboundEstimateNote
      : setReturnEstimateNote;
    const hasRoute = isOutbound ? outboundHasRoute : returnHasRoute;
    const hasDepart = Boolean(depart.trim());
    const hasArrive = Boolean(arrive.trim());

    setNote(null);
    if (!canEstimateMode) {
      setNote(transportModeHint(roundTripMode));
      return;
    }
    if (!origin || !destination || !hasRoute) {
      setNote("Origem e destino precisam de coordenadas para estimar.");
      return;
    }
    if (!hasDepart && !hasArrive) {
      setNote("Preencha a saída ou a chegada; o botão calcula o outro.");
      return;
    }

    setEstimatingLeg(leg);
    try {
      const duration = await fetchLegDurationSeconds(origin, destination);
      if (duration == null) {
        setNote(
          "Não foi possível estimar este trecho. Informe os horários manualmente."
        );
        return;
      }
      const durationLabel = formatDurationFriendly(duration);
      if (hasDepart) {
        const arrival = estimateArrivalHHmm(depart, duration);
        if (!arrival) {
          setNote("Informe um horário de saída válido (ex: 09:30).");
          return;
        }
        if (isOutbound) setOutboundArrive(arrival);
        else setReturnArrive(arrival);
        setNote(`~${durationLabel} de viagem → chegada ${arrival}.`);
        return;
      }
      const departEst = estimateDepartHHmm(arrive, duration);
      if (!departEst) {
        setNote("Informe um horário de chegada válido (ex: 14:30).");
        return;
      }
      if (isOutbound) setOutboundDepart(departEst);
      else setReturnDepart(departEst);
      setNote(`~${durationLabel} de viagem → saída ${departEst}.`);
    } catch (error) {
      setNote(getErrorMessage(error, "Não foi possível estimar o horário."));
    } finally {
      setEstimatingLeg(null);
    }
  }

  async function syncRoundTripForTrip(
    tripId: string,
    stopPayload: {
      name: string;
      place_id: string | null;
      lat: number | null;
      lng: number | null;
      start_date: string;
      end_date: string;
      sort_order: number;
    }[],
    knownOutboundId: string | null,
    knownReturnId: string | null
  ) {
    const days = await fetchTripItineraryLite(tripId);
    const firstStop = stopPayload[0];
    const lastStop =
      lodgingStopForDate(stopPayload, form.end_date) ??
      stopPayload[stopPayload.length - 1];

    const fresh = findRoundTripTransfers({
      itinerary: days,
      firstStop: firstStop ?? null,
      lastStop: lastStop ?? null,
      tripOrigin: homeOrigin,
    });
    const outboundId = fresh.outbound?.id ?? knownOutboundId;
    const returnId = fresh.returnTrip?.id ?? knownReturnId;

    if (!includeRoundTrip || !homeOrigin?.label.trim() || !firstStop) {
      const toDelete = [
        outboundId,
        returnId,
      ].filter((id): id is string => Boolean(id));
      const unique = [...new Set(toDelete)];
      await Promise.all(unique.map((id) => deleteItineraryActivity(id)));
      return;
    }

    const home: RoundTripHome = {
      label: homeOrigin.label.trim(),
      lat: homeOrigin.lat,
      lng: homeOrigin.lng,
      place_id: homeOrigin.place_id,
    };
    const planned = planItineraryTransfers({
      stops: stopPayload,
      startDate: form.start_date,
      endDate: form.end_date,
      home,
    });
    const sync = planTransferActivitySync({
      planned,
      days,
      home,
      mode: roundTripMode,
      outboundTimes: { depart: outboundDepart, arrive: outboundArrive },
      returnTimes: { depart: returnDepart, arrive: returnArrive },
      knownOutboundId: outboundId,
      knownReturnId: returnId,
    });

    await Promise.all(
      sync.update.map(({ date: _date, ...payload }) =>
        updateItineraryActivity(payload)
      )
    );
    await Promise.all(
      sync.create.map(({ date: _date, ...payload }) =>
        createItineraryActivity(payload)
      )
    );
    await Promise.all(sync.deleteIds.map((id) => deleteItineraryActivity(id)));
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast({
        title: "Título obrigatório",
        description: "Dê um nome para a viagem.",
        variant: "destructive",
      });
      return;
    }
    if (form.end_date < form.start_date) {
      toast({
        title: "Datas inválidas",
        description: "A data de fim deve ser igual ou posterior ao início.",
        variant: "destructive",
      });
      return;
    }
    if (includeRoundTrip && !homeOrigin?.label.trim()) {
      toast({
        title: "Origem da viagem",
        description: "Informe a origem (casa / partida) dos deslocamentos.",
        variant: "destructive",
      });
      return;
    }

    const namedStops = stops.filter((s) => s.name.trim());
    if (namedStops.length === 0) {
      toast({
        title: "Parada obrigatória",
        description: "Informe ao menos uma cidade, estado ou país.",
        variant: "destructive",
      });
      return;
    }

    const stopPayload = namedStops.map((s, i) => ({
      name: s.name.trim(),
      place_id: s.place_id ?? null,
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      start_date: s.start_date,
      end_date: s.end_date,
      sort_order: i,
    }));

    const stopError = validateTripStops(
      stopPayload,
      form.start_date,
      form.end_date
    );
    if (stopError) {
      toast({
        title: "Paradas",
        description: stopError,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const originPatch =
        includeRoundTrip && homeOrigin?.label.trim()
          ? {
              origin_label: homeOrigin.label.trim(),
              origin_lat: homeOrigin.lat,
              origin_lng: homeOrigin.lng,
            }
          : !includeRoundTrip && (outboundActivityId || returnActivityId)
            ? {
                origin_label: null,
                origin_lat: null,
                origin_lng: null,
              }
            : {};

      const payload = {
        title: form.title.trim(),
        destination: form.destination?.trim() || null,
        destination_lat: form.destination_lat ?? null,
        destination_lng: form.destination_lng ?? null,
        destination_place_id: form.destination_place_id ?? null,
        start_date: form.start_date,
        end_date: form.end_date,
        budget: form.budget,
        notes: form.notes?.trim() || null,
        status: form.status,
        stops: stopPayload,
        ...originPatch,
      };
      if (isEditing && trip) {
        const datesChanged =
          payload.start_date !== trip.start_date ||
          payload.end_date !== trip.end_date;
        await updateTrip({ id: trip.id, ...payload });
        try {
          await syncRoundTripForTrip(
            trip.id,
            stopPayload,
            outboundActivityId,
            returnActivityId
          );
        } catch {
          // Best-effort: viagem já atualizada.
        }
        toast({
          title: "Viagem atualizada!",
          description: datesChanged
            ? "Roteiro ajustado às novas datas. Dias fora do intervalo foram removidos."
            : undefined,
          duration: datesChanged ? 3500 : 2000,
        });
      } else {
        const created = await createTrip({
          ...form,
          ...payload,
          spent: form.spent ?? 0,
        });
        try {
          await syncRoundTripForTrip(created.id, stopPayload, null, null);
        } catch {
          // Best-effort: viagem já criada.
        }
        toast({
          title: "Viagem criada!",
          description: includeRoundTrip
            ? "Roteiro gerado com deslocamentos de ida e volta."
            : "Roteiro dia a dia gerado automaticamente.",
          duration: 3000,
        });
      }
      setOpen(false);
      onSaved();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar a viagem."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const packingStops = stops
    .filter(
      (s) =>
        typeof s.lat === "number" &&
        typeof s.lng === "number" &&
        Number.isFinite(s.lat) &&
        Number.isFinite(s.lng)
    )
    .map((s) => ({
      name: s.name,
      lat: s.lat as number,
      lng: s.lng as number,
      startDate: s.start_date,
      endDate: s.end_date,
    }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <FormDialogShell
        title={isEditing ? "Editar viagem" : "Nova viagem"}
        wide
        footer={
          <FormFooter
            onCancel={() => setOpen(false)}
            onSubmit={() => void handleSave()}
            submitLabel={
              isEditing ? "Salvar alterações" : "Criar viagem"
            }
            loading={loading}
          />
        }
      >
        <FormSection title="Essencial">
          <FormField label="Título" required>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Eurotrip 2026"
            />
          </FormField>
          <FormFieldRow>
            <FormField label="Início" required>
              <DatePicker
                date={new Date(`${form.start_date}T12:00:00`)}
                onSelect={(d) => {
                  const next = d
                    ? d.toISOString().split("T")[0]
                    : form.start_date;
                  setForm({ ...form, start_date: next });
                  // Criação com 1 parada: a parada cobre a viagem inteira.
                  if (!isEditing && stops.length === 1) {
                    updateStop(stops[0].key, { start_date: next });
                  }
                }}
              />
            </FormField>
            <FormField label="Fim" required>
              <DatePicker
                date={new Date(`${form.end_date}T12:00:00`)}
                onSelect={(d) => {
                  const next = d
                    ? d.toISOString().split("T")[0]
                    : form.end_date;
                  setForm({ ...form, end_date: next });
                  if (!isEditing && stops.length === 1) {
                    updateStop(stops[0].key, { end_date: next });
                  }
                }}
              />
            </FormField>
          </FormFieldRow>
        </FormSection>

        <FormSection
          title="Paradas"
          subtitle="Pode ser só uma cidade caso o destino seja apenas uma cidade, ou várias em sequência, com datas em cada parada (ex.: Madrid → Berlim → Paris)."
        >
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              onClick={addStop}
            >
              <Plus className="h-3.5 w-3.5" />
              Cidade
            </Button>
          </div>
          {stops.map((stop, index) => (
              <div
                key={stop.key}
                className="space-y-2 rounded-lg border bg-muted/20 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Parada {index + 1}
                  </p>
                  {stops.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => removeStop(stop.key)}
                      aria-label="Remover parada"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
                <PlaceCatalogSearch
                  label="Cidade / região"
                  scope="regions"
                  required
                  requestUserLocation={false}
                  selectedLabel={stop.place_id || stop.name ? stop.name : null}
                  onClear={() =>
                    updateStop(stop.key, {
                      name: "",
                      place_id: null,
                      lat: null,
                      lng: null,
                    })
                  }
                  onPick={(hit) =>
                    updateStop(stop.key, {
                      name: hit.name,
                      place_id: hit.google_place_id,
                      lat: hit.lat,
                      lng: hit.lng,
                    })
                  }
                />
                {!stop.place_id ? (
                  <Input
                    value={stop.name}
                    onChange={(e) =>
                      updateStop(stop.key, {
                        name: e.target.value,
                        place_id: null,
                        lat: null,
                        lng: null,
                      })
                    }
                    placeholder="Ou digite o nome manualmente"
                  />
                ) : null}
                <FormFieldRow>
                  <FormField label="Chegada">
                    <DatePicker
                      date={new Date(`${stop.start_date}T12:00:00`)}
                      onSelect={(d) =>
                        updateStop(stop.key, {
                          start_date: d
                            ? d.toISOString().split("T")[0]
                            : stop.start_date,
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Saída">
                    <DatePicker
                      date={new Date(`${stop.end_date}T12:00:00`)}
                      onSelect={(d) =>
                        updateStop(stop.key, {
                          end_date: d
                            ? d.toISOString().split("T")[0]
                            : stop.end_date,
                        })
                      }
                    />
                  </FormField>
                </FormFieldRow>
              </div>
            ))}
        </FormSection>

        <FormDisclosure
          title={
            isEditing
              ? "Deslocamentos de ida e volta"
              : "Incluir deslocamentos de ida e volta"
          }
          description="Gera trechos de transporte no roteiro entre origem e paradas."
          open={includeRoundTrip}
          onOpenChange={setIncludeRoundTrip}
          variant="toggle"
        >
          <PlaceCatalogSearch
            label="Origem (casa / partida)"
            scope="regions"
            requestUserLocation={false}
            selectedLabel={homeOrigin?.label ?? null}
            onClear={() => {
              setHomeOrigin(null);
              setOutboundEstimateNote(null);
              setReturnEstimateNote(null);
            }}
            onPick={(hit) => {
              setHomeOrigin({
                label: hit.name,
                lat: hit.lat,
                lng: hit.lng,
                place_id: hit.google_place_id,
              });
              setOutboundEstimateNote(null);
              setReturnEstimateNote(null);
            }}
          />
          <FormField label="Modo" hint={transportModeHint(roundTripMode)}>
            <Select
              value={roundTripMode}
              onValueChange={(v) => {
                setRoundTripMode(v as TripTransportMode);
                setOutboundEstimateNote(null);
                setReturnEstimateNote(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIP_TRANSPORT_MODES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {TRIP_TRANSPORT_MODE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <div className="space-y-2">
            <FormFieldRow>
              <FormField label="Ida · saída" optional>
                <OptionalTimeInput
                  value={outboundDepart}
                  onChange={(next) => {
                    setOutboundDepart(next);
                    setOutboundEstimateNote(null);
                  }}
                  aria-label="Saída da ida"
                />
              </FormField>
              <FormField label="Ida · chegada" optional>
                <OptionalTimeInput
                  value={outboundArrive}
                  onChange={(next) => {
                    setOutboundArrive(next);
                    setOutboundEstimateNote(null);
                  }}
                  aria-label="Chegada da ida"
                />
              </FormField>
            </FormFieldRow>
            {canEstimateMode ? (
              <div className="space-y-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={
                    estimatingLeg != null ||
                    !outboundHasRoute ||
                    (!outboundDepart.trim() && !outboundArrive.trim())
                  }
                  onClick={() => void handleEstimateLeg("outbound")}
                >
                  {estimatingLeg === "outbound"
                    ? "Estimando ida…"
                    : "Estimar ida pela rota"}
                </Button>
                {!outboundHasRoute ? (
                  <p className="text-xs text-muted-foreground">
                    Origem e 1ª parada precisam de coordenadas.
                  </p>
                ) : null}
                {outboundEstimateNote ? (
                  <p className="text-xs text-muted-foreground">
                    {outboundEstimateNote}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <FormFieldRow>
              <FormField label="Volta · saída" optional>
                <OptionalTimeInput
                  value={returnDepart}
                  onChange={(next) => {
                    setReturnDepart(next);
                    setReturnEstimateNote(null);
                  }}
                  aria-label="Saída da volta"
                />
              </FormField>
              <FormField label="Volta · chegada" optional>
                <OptionalTimeInput
                  value={returnArrive}
                  onChange={(next) => {
                    setReturnArrive(next);
                    setReturnEstimateNote(null);
                  }}
                  aria-label="Chegada da volta"
                />
              </FormField>
            </FormFieldRow>
            {canEstimateMode ? (
              <div className="space-y-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={
                    estimatingLeg != null ||
                    !returnHasRoute ||
                    (!returnDepart.trim() && !returnArrive.trim())
                  }
                  onClick={() => void handleEstimateLeg("return")}
                >
                  {estimatingLeg === "return"
                    ? "Estimando volta…"
                    : "Estimar volta pela rota"}
                </Button>
                {!returnHasRoute ? (
                  <p className="text-xs text-muted-foreground">
                    Última parada e origem precisam de coordenadas.
                  </p>
                ) : null}
                {returnEstimateNote ? (
                  <p className="text-xs text-muted-foreground">
                    {returnEstimateNote}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </FormDisclosure>

        <FormDisclosure
          title="Opções avançadas"
          description="Orçamento, status, notas e sugestão de mala."
          open={showAdvanced}
          onOpenChange={setShowAdvanced}
        >
          <FormField label="Orçamento" optional>
            <MoneyInput
              value={form.budget ?? null}
              onChange={(v) =>
                setForm({ ...form, budget: v === "" ? null : v })
              }
            />
          </FormField>
          <FormField label="Status" optional>
            <Select
              value={form.status}
              onValueChange={(v) =>
                setForm({ ...form, status: v as TripStatus })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TRIP_STATUS_LABELS) as TripStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {TRIP_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Notas" optional>
            <Input
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </FormField>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Sugestão de mala</p>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn("h-8 w-8", showPacking && "bg-primary/10")}
              aria-pressed={showPacking}
              aria-label={
                showPacking
                  ? "Ocultar o que levar na mala"
                  : "Ver o que levar na mala"
              }
              title="O que levar na mala"
              onClick={() => setShowPacking((v) => !v)}
            >
              <Shirt className="h-4 w-4" />
            </Button>
          </div>
          {showPacking ? (
            <TripWeatherPackingPanel stops={packingStops} />
          ) : null}
        </FormDisclosure>
      </FormDialogShell>
    </Dialog>
  );
}
