import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDialogShell, FormFooter } from "@/components/FormDialogShell";
import { FormField, FormFieldRow } from "@/components/FormField";
import { OptionalTimeInput } from "@/components/OptionalTimeInput";
import { PlaceCatalogSearch } from "@/components/PlaceCatalogSearch";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import {
  createItineraryActivity,
  deleteItineraryActivity,
  updateItineraryActivity,
  updateTrip,
} from "@/api/travel";
import { formatDurationFriendly } from "@/domain/itinerary/visits";
import {
  endpointFromStop,
  lodgingStopForDate,
  planItineraryTransfers,
  planTransferActivitySync,
  toItineraryActivityInput,
} from "@/domain/travel/itineraryTransfers";
import {
  activityTimeToInput,
  findRoundTripTransfers,
  type RoundTripHome,
} from "@/domain/travel/roundTripTransfers";
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
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { fetchTravelRoutes } from "@/lib/googleRoutes";
import type { TripFull } from "@/types/travel";

type TripRoundTripDialogProps = {
  trip: TripFull;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
};

export function TripRoundTripDialog({
  trip,
  open,
  onOpenChange,
  onSaved,
}: TripRoundTripDialogProps) {
  const { toast } = useToast();
  const [home, setHome] = useState<RoundTripHome | null>(null);
  const [mode, setMode] = useState<TripTransportMode>("car");
  const [outboundDepart, setOutboundDepart] = useState("");
  const [outboundArrive, setOutboundArrive] = useState("");
  const [returnDepart, setReturnDepart] = useState("");
  const [returnArrive, setReturnArrive] = useState("");
  const [estimatingLeg, setEstimatingLeg] = useState<"outbound" | "return" | null>(null);
  const [outboundNote, setOutboundNote] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const stops = trip.stops ?? [];
  const firstStop = stops[0] ?? null;
  const lastStop =
    lodgingStopForDate(stops, trip.end_date) ?? stops[stops.length - 1] ?? null;
  const tripHome: RoundTripHome | null = useMemo(
    () =>
      trip.origin_label?.trim()
        ? {
            label: trip.origin_label.trim(),
            lat: trip.origin_lat ?? null,
            lng: trip.origin_lng ?? null,
            place_id: null,
          }
        : null,
    [trip.origin_label, trip.origin_lat, trip.origin_lng]
  );
  const match = useMemo(
    () =>
      findRoundTripTransfers({
        itinerary: trip.itinerary,
        firstStop,
        lastStop,
        tripOrigin: tripHome,
      }),
    [firstStop, lastStop, trip.itinerary, tripHome]
  );
  const hasExisting = Boolean(match.outbound || match.returnTrip);

  useEffect(() => {
    if (!open) return;
    setHome(match.home ?? tripHome);
    setMode(
      normalizeTripTransportMode(
        match.outbound?.transport_mode ?? match.returnTrip?.transport_mode ?? "car"
      )
    );
    setOutboundDepart(activityTimeToInput(match.outbound?.activity_time));
    setOutboundArrive(activityTimeToInput(match.outbound?.arrival_time));
    setReturnDepart(activityTimeToInput(match.returnTrip?.activity_time));
    setReturnArrive(activityTimeToInput(match.returnTrip?.arrival_time));
    setOutboundNote(null);
    setReturnNote(null);
  }, [match, open, tripHome]);

  const homeEndpoint: TransferEndpoint | null = home?.label.trim()
    ? {
        label: home.label.trim(),
        lat: home.lat,
        lng: home.lng,
        place_id: home.place_id,
      }
    : null;
  const planned = planItineraryTransfers({
    stops,
    startDate: trip.start_date,
    endDate: trip.end_date,
    home: homeEndpoint,
  });
  const outboundEndpoint =
    planned.find((item) => item.role === "outbound")?.destination ??
    (firstStop ? endpointFromStop(firstStop) : null);
  const returnEndpoint =
    [...planned].reverse().find((item) => item.role === "return")?.origin ??
    (lastStop ? endpointFromStop(lastStop) : null);
  const canEstimate = canEstimateTransferArrival(mode);
  const outboundHasRoute =
    transferEndpointHasCoords(homeEndpoint) &&
    transferEndpointHasCoords(outboundEndpoint);
  const returnHasRoute =
    transferEndpointHasCoords(returnEndpoint) &&
    transferEndpointHasCoords(homeEndpoint);

  async function routeDuration(
    origin: TransferEndpoint,
    destination: TransferEndpoint
  ): Promise<number | null> {
    const routeMode = routesModeForTransport(mode);
    if (
      !routeMode ||
      !transferEndpointHasCoords(origin) ||
      !transferEndpointHasCoords(destination)
    ) {
      return null;
    }
    const routes = await fetchTravelRoutes({
      origin: { lat: origin.lat!, lng: origin.lng! },
      destination: destination.place_id
        ? { placeId: destination.place_id }
        : { lat: destination.lat!, lng: destination.lng! },
      modes: [routeMode],
    });
    const route = routes.find((item) => item.mode === routeMode) ?? routes[0];
    return route?.available ? (route.durationSeconds ?? null) : null;
  }

  async function estimate(leg: "outbound" | "return") {
    if (estimatingLeg) return;
    const outbound = leg === "outbound";
    const origin = outbound ? homeEndpoint : returnEndpoint;
    const destination = outbound ? outboundEndpoint : homeEndpoint;
    const depart = outbound ? outboundDepart : returnDepart;
    const arrive = outbound ? outboundArrive : returnArrive;
    const setNote = outbound ? setOutboundNote : setReturnNote;
    const hasRoute = outbound ? outboundHasRoute : returnHasRoute;
    setNote(null);

    if (!canEstimate) {
      setNote(transportModeHint(mode));
      return;
    }
    if (!origin || !destination || !hasRoute) {
      setNote("Origem e destino precisam de coordenadas para estimar.");
      return;
    }
    if (!depart.trim() && !arrive.trim()) {
      setNote("Preencha a saída ou a chegada; o botão calcula o outro.");
      return;
    }

    setEstimatingLeg(leg);
    try {
      const duration = await routeDuration(origin, destination);
      if (duration == null) {
        setNote("Não foi possível estimar este trecho. Informe os horários manualmente.");
        return;
      }
      if (depart.trim()) {
        const result = estimateArrivalHHmm(depart, duration);
        if (!result) {
          setNote("Informe um horário de saída válido (ex: 09:30).");
          return;
        }
        if (outbound) setOutboundArrive(result);
        else setReturnArrive(result);
        setNote(`~${formatDurationFriendly(duration)} de viagem → chegada ${result}.`);
      } else {
        const result = estimateDepartHHmm(arrive, duration);
        if (!result) {
          setNote("Informe um horário de chegada válido (ex: 14:30).");
          return;
        }
        if (outbound) setOutboundDepart(result);
        else setReturnDepart(result);
        setNote(`~${formatDurationFriendly(duration)} de viagem → saída ${result}.`);
      }
    } catch (error) {
      setNote(getErrorMessage(error, "Não foi possível estimar o horário."));
    } finally {
      setEstimatingLeg(null);
    }
  }

  async function save() {
    if (!home?.label.trim()) {
      toast({
        title: "Origem da viagem",
        description: "Informe a origem (casa / partida) dos deslocamentos.",
        variant: "destructive",
      });
      return;
    }
    if (stops.length === 0 || trip.itinerary.length === 0) {
      toast({
        title: "Roteiro incompleto",
        description: "A viagem precisa ter ao menos uma parada e um dia de roteiro.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const normalizedHome = { ...home, label: home.label.trim() };
      const sync = planTransferActivitySync({
        planned: planItineraryTransfers({
          stops,
          startDate: trip.start_date,
          endDate: trip.end_date,
          home: normalizedHome,
        }),
        days: trip.itinerary,
        home: normalizedHome,
        mode,
        outboundTimes: { depart: outboundDepart, arrive: outboundArrive },
        returnTimes: { depart: returnDepart, arrive: returnArrive },
        knownOutboundId: match.outbound?.id ?? null,
        knownReturnId: match.returnTrip?.id ?? null,
      });

      await Promise.all(
        sync.update.map((item) =>
          updateItineraryActivity(toItineraryActivityInput(item))
        )
      );
      await Promise.all(
        sync.create.map((item) =>
          createItineraryActivity(toItineraryActivityInput(item))
        )
      );
      await Promise.all(sync.deleteIds.map(deleteItineraryActivity));
      await updateTrip({
        id: trip.id,
        origin_label: normalizedHome.label,
        origin_lat: normalizedHome.lat,
        origin_lng: normalizedHome.lng,
      });
      toast({
        title: hasExisting ? "Deslocamentos atualizados!" : "Deslocamentos adicionados!",
        duration: 2000,
      });
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar os deslocamentos."),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      const ids = [match.outbound?.id, match.returnTrip?.id].filter(
        (id): id is string => Boolean(id)
      );
      await Promise.all([...new Set(ids)].map(deleteItineraryActivity));
      await updateTrip({
        id: trip.id,
        origin_label: null,
        origin_lat: null,
        origin_lng: null,
      });
      toast({ title: "Deslocamentos removidos", duration: 2000 });
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível remover os deslocamentos."),
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
    }
  }

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      {hasExisting ? (
        <ConfirmDeleteDialog
          title="Remover ida e volta?"
          description="Os deslocamentos do início e do fim da viagem serão removidos do roteiro."
          confirmLabel="Remover"
          loading={removing}
          loadingLabel="Removendo…"
          onConfirm={remove}
        >
          <Button type="button" variant="ghost" className="text-destructive">
            Remover ida e volta
          </Button>
        </ConfirmDeleteDialog>
      ) : (
        <span />
      )}
      <FormFooter
        onCancel={() => onOpenChange(false)}
        onSubmit={() => void save()}
        submitLabel={hasExisting ? "Salvar deslocamentos" : "Adicionar ao roteiro"}
        loading={saving}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogShell
        title="Deslocamentos de ida e volta"
        description="Adicione a saída no primeiro dia e o retorno no último dia do roteiro."
        footer={footer}
      >
        <PlaceCatalogSearch
          label="Origem (casa / partida)"
          scope="regions"
          required
          requestUserLocation={false}
          selectedLabel={home?.label ?? null}
          onClear={() => {
            setHome(null);
            setOutboundNote(null);
            setReturnNote(null);
          }}
          onPick={(hit) => {
            setHome({
              label: hit.name,
              lat: hit.lat,
              lng: hit.lng,
              place_id: hit.google_place_id,
            });
            setOutboundNote(null);
            setReturnNote(null);
          }}
        />

        <FormField label="Modo" hint={transportModeHint(mode)}>
          <Select
            value={mode}
            onValueChange={(value) => {
              setMode(value as TripTransportMode);
              setOutboundNote(null);
              setReturnNote(null);
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

        <TimeFields
          title="Ida"
          depart={outboundDepart}
          arrive={outboundArrive}
          onDepartChange={(value) => {
            setOutboundDepart(value);
            setOutboundNote(null);
          }}
          onArriveChange={(value) => {
            setOutboundArrive(value);
            setOutboundNote(null);
          }}
          canEstimate={canEstimate}
          hasRoute={outboundHasRoute}
          estimating={estimatingLeg === "outbound"}
          disabled={estimatingLeg != null}
          note={outboundNote}
          onEstimate={() => void estimate("outbound")}
          routeHint="Origem e 1ª parada precisam de coordenadas."
        />

        <TimeFields
          title="Volta"
          depart={returnDepart}
          arrive={returnArrive}
          onDepartChange={(value) => {
            setReturnDepart(value);
            setReturnNote(null);
          }}
          onArriveChange={(value) => {
            setReturnArrive(value);
            setReturnNote(null);
          }}
          canEstimate={canEstimate}
          hasRoute={returnHasRoute}
          estimating={estimatingLeg === "return"}
          disabled={estimatingLeg != null}
          note={returnNote}
          onEstimate={() => void estimate("return")}
          routeHint="Última parada e origem precisam de coordenadas."
        />
      </FormDialogShell>
    </Dialog>
  );
}

type TimeFieldsProps = {
  title: "Ida" | "Volta";
  depart: string;
  arrive: string;
  onDepartChange: (value: string) => void;
  onArriveChange: (value: string) => void;
  canEstimate: boolean;
  hasRoute: boolean;
  estimating: boolean;
  disabled: boolean;
  note: string | null;
  onEstimate: () => void;
  routeHint: string;
};

function TimeFields({
  title,
  depart,
  arrive,
  onDepartChange,
  onArriveChange,
  canEstimate,
  hasRoute,
  estimating,
  disabled,
  note,
  onEstimate,
  routeHint,
}: TimeFieldsProps) {
  return (
    <section className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <FormFieldRow>
        <FormField label="Saída" optional>
          <OptionalTimeInput
            value={depart}
            onChange={onDepartChange}
            aria-label={`Saída da ${title.toLowerCase()}`}
          />
        </FormField>
        <FormField label="Chegada" optional>
          <OptionalTimeInput
            value={arrive}
            onChange={onArriveChange}
            aria-label={`Chegada da ${title.toLowerCase()}`}
          />
        </FormField>
      </FormFieldRow>
      {canEstimate ? (
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={disabled || !hasRoute || (!depart.trim() && !arrive.trim())}
            onClick={onEstimate}
          >
            {estimating ? `Estimando ${title.toLowerCase()}…` : `Estimar ${title.toLowerCase()} pela rota`}
          </Button>
          {!hasRoute ? (
            <p className="text-xs text-muted-foreground">{routeHint}</p>
          ) : null}
          {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
