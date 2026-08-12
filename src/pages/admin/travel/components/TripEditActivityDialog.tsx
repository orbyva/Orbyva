import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OptionalTimeInput } from "@/components/OptionalTimeInput";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import {
  PlaceCatalogSearch,
  type PlaceCatalogPick,
} from "@/components/PlaceCatalogSearch";
import {
  ACTIVITY_CATEGORY_LABELS,
  normalizeTripActivityCategory,
} from "@/domain/travel";
import {
  TRIP_TRANSPORT_MODE_LABELS,
  TRIP_TRANSPORT_MODES,
  canEstimateTransferArrival,
  estimateArrivalHHmm,
  estimateDepartHHmm,
  normalizeTripTransportMode,
  routesModeForTransport,
  transferEndpointHasCoords,
  transferEndpointsTitle,
  transportModeHint,
  type TransferEndpoint,
  type TripTransportMode,
} from "@/domain/travel/transportModes";
import { useUserLocationBias } from "@/hooks/useUserLocationBias";
import { fetchTravelRoutes } from "@/lib/googleRoutes";
import { formatDurationFriendly } from "@/domain/itinerary/visits";
import { getErrorMessage } from "@/lib/errors";
import type { PlaceVisit } from "@/types/places";
import type { TripActivityCategory } from "@/types/travel";

export type ActivityForm = {
  title: string;
  activity_time: string;
  arrival_time: string;
  transport_mode: TripTransportMode;
  notes: string;
  link_url: string;
  is_reserved: boolean;
  category: TripActivityCategory;
  place_visit_id: string | null;
  linked_place_label: string | null;
  pending_catalog: PlaceCatalogPick | null;
  /** Origem do deslocamento (país/estado/cidade). */
  origin: TransferEndpoint | null;
  /** Destino do deslocamento (país/estado/cidade). */
  destination: TransferEndpoint | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ActivityForm;
  onSave: (form: ActivityForm) => void;
  places: PlaceVisit[];
  mode?: "create" | "edit";
};

function pickToEndpoint(hit: PlaceCatalogPick): TransferEndpoint {
  return {
    label: hit.name.trim(),
    lat: hit.lat,
    lng: hit.lng,
    place_id: hit.google_place_id?.trim() || null,
  };
}

function syncTransferTitle(
  origin: TransferEndpoint | null,
  destination: TransferEndpoint | null
): string {
  if (origin?.label.trim() && destination?.label.trim()) {
    return transferEndpointsTitle(origin.label, destination.label);
  }
  return "";
}

export function TripEditActivityDialog({
  open,
  onOpenChange,
  form: seed,
  onSave,
  places,
  mode = "edit",
}: Props) {
  const [form, setForm] = useState(seed);
  const { bias: geoBias } = useUserLocationBias(open);
  const [estimating, setEstimating] = useState(false);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(seed);
    setEstimateNote(null);
  }, [open, seed]);

  const isCreate = mode === "create";
  const linkedLabel =
    form.linked_place_label ||
    places.find((p) => p.id === form.place_visit_id)?.name ||
    null;
  const category = normalizeTripActivityCategory(form.category);
  const transportMode = normalizeTripTransportMode(form.transport_mode);
  const hasRoute =
    transferEndpointHasCoords(form.origin) &&
    transferEndpointHasCoords(form.destination);
  const canEstimateMode =
    category === "transport" && canEstimateTransferArrival(transportMode);
  const hasDepart = Boolean(form.activity_time.trim());
  const hasArrive = Boolean(form.arrival_time.trim());
  const canEstimate =
    canEstimateMode && hasRoute && (hasDepart || hasArrive);

  async function fetchDurationSeconds(): Promise<number | null> {
    const routesMode = routesModeForTransport(transportMode);
    if (!routesMode || !form.origin || !form.destination) return null;
    if (
      !transferEndpointHasCoords(form.origin) ||
      !transferEndpointHasCoords(form.destination)
    ) {
      return null;
    }
    const destination = form.destination.place_id
      ? { placeId: form.destination.place_id }
      : { lat: form.destination.lat!, lng: form.destination.lng! };
    const legs = await fetchTravelRoutes({
      origin: { lat: form.origin.lat!, lng: form.origin.lng! },
      destination,
      modes: [routesMode],
    });
    const leg = legs.find((l) => l.mode === routesMode) ?? legs[0];
    if (!leg?.available || leg.durationSeconds == null) return null;
    return leg.durationSeconds;
  }

  /** Com saída → preenche chegada; com chegada (só) → preenche saída. */
  async function handleEstimateTimes() {
    if (estimating) return;
    setEstimating(true);
    setEstimateNote(null);
    try {
      if (!hasDepart && !hasArrive) {
        setEstimateNote("Informe a saída ou a chegada para estimar o outro.");
        return;
      }
      const duration = await fetchDurationSeconds();
      if (duration == null) {
        setEstimateNote(
          "Não foi possível estimar este trecho. Informe os horários manualmente."
        );
        return;
      }
      const durationLabel = formatDurationFriendly(duration);
      if (hasDepart) {
        const arrival = estimateArrivalHHmm(form.activity_time, duration);
        if (!arrival) {
          setEstimateNote("Informe um horário de saída válido (ex: 09:30).");
          return;
        }
        setForm((prev) => ({ ...prev, arrival_time: arrival }));
        setEstimateNote(`~${durationLabel} de viagem → chegada ${arrival}.`);
        return;
      }
      const depart = estimateDepartHHmm(form.arrival_time, duration);
      if (!depart) {
        setEstimateNote("Informe um horário de chegada válido (ex: 14:30).");
        return;
      }
      setForm((prev) => ({ ...prev, activity_time: depart }));
      setEstimateNote(`~${durationLabel} de viagem → saída ${depart}.`);
    } catch (error) {
      setEstimateNote(
        getErrorMessage(error, "Não foi possível estimar o horário.")
      );
    } finally {
      setEstimating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {isCreate
              ? form.category === "transport"
                ? "Adicionar deslocamento"
                : "Adicionar visita"
              : form.category === "transport"
                ? "Editar deslocamento"
                : "Editar visita"}
          </DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          {category === "transport" ? (
            <>
              <div className="space-y-1">
                <PlaceCatalogSearch
                  label="Origem"
                  required
                  scope="regions"
                  bias={geoBias}
                  requestUserLocation={false}
                  selectedLabel={form.origin?.label ?? null}
                  onClear={() => {
                    const origin = null;
                    setForm((prev) => ({
                      ...prev,
                      origin,
                      title: syncTransferTitle(origin, prev.destination),
                    }));
                    setEstimateNote(null);
                  }}
                  onPick={(hit) => {
                    const origin = pickToEndpoint(hit);
                    setForm((prev) => ({
                      ...prev,
                      origin,
                      title: syncTransferTitle(origin, prev.destination),
                    }));
                    setEstimateNote(null);
                  }}
                />
              </div>
              <div className="space-y-1">
                <PlaceCatalogSearch
                  label="Destino"
                  required
                  scope="regions"
                  bias={geoBias}
                  requestUserLocation={false}
                  selectedLabel={form.destination?.label ?? null}
                  onClear={() => {
                    const destination = null;
                    setForm((prev) => ({
                      ...prev,
                      destination,
                      title: syncTransferTitle(prev.origin, destination),
                    }));
                    setEstimateNote(null);
                  }}
                  onPick={(hit) => {
                    const destination = pickToEndpoint(hit);
                    setForm((prev) => ({
                      ...prev,
                      destination,
                      title: syncTransferTitle(prev.origin, destination),
                    }));
                    setEstimateNote(null);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  País, estado ou cidade — obrigatórios. O nome fica “Origem →
                  Destino”.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <PlaceCatalogSearch
                label="Local"
                bias={geoBias}
                requestUserLocation={false}
                selectedLabel={linkedLabel}
                onClear={() =>
                  setForm((prev) => ({
                    ...prev,
                    place_visit_id: null,
                    linked_place_label: null,
                    pending_catalog: null,
                  }))
                }
                onPick={(hit) => {
                  const existing = places.find(
                    (p) =>
                      (hit.google_place_id &&
                        p.google_place_id === hit.google_place_id) ||
                      (p.lat != null &&
                        p.lng != null &&
                        p.lat === hit.lat &&
                        p.lng === hit.lng &&
                        p.name === hit.name)
                  );
                  setForm((prev) => {
                    const prevPlaceName = (
                      prev.linked_place_label ||
                      places.find((p) => p.id === prev.place_visit_id)?.name ||
                      ""
                    ).trim();
                    const titleTrim = prev.title.trim();
                    const syncTitle =
                      !titleTrim ||
                      !prevPlaceName ||
                      titleTrim === prevPlaceName;
                    return {
                      ...prev,
                      title: syncTitle ? hit.name : prev.title,
                      category: existing?.type ?? hit.type,
                      place_visit_id: existing?.id ?? null,
                      linked_place_label: hit.name,
                      pending_catalog: existing ? null : hit,
                    };
                  });
                }}
              />
              {!linkedLabel ? (
                <p className="text-xs text-muted-foreground">
                  Busque o local para calcular o trajeto no roteiro.
                </p>
              ) : null}
            </div>
          )}

          {category !== "transport" ? (
            <div>
              <FormLabel required>Título</FormLabel>
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </div>
          ) : null}

          {category === "transport" ? (
            <div>
              <FormLabel>Modo</FormLabel>
              <Select
                value={transportMode}
                onValueChange={(v) => {
                  setEstimateNote(null);
                  setForm((prev) => ({
                    ...prev,
                    transport_mode: v as TripTransportMode,
                  }));
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
              <p className="mt-1 text-xs text-muted-foreground">
                {transportModeHint(transportMode)}
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel optional>
                {category === "transport" ? "Saída" : "Horário"}
              </FormLabel>
              <OptionalTimeInput
                value={form.activity_time}
                onChange={(next) => {
                  setEstimateNote(null);
                  setForm((prev) => ({
                    ...prev,
                    activity_time: next,
                  }));
                }}
                aria-label={
                  category === "transport" ? "Horário de saída" : "Horário"
                }
              />
            </div>
            {category === "transport" ? (
              <div>
                <FormLabel optional>Chegada</FormLabel>
                <OptionalTimeInput
                  value={form.arrival_time}
                  onChange={(next) => {
                    setEstimateNote(null);
                    setForm((prev) => ({
                      ...prev,
                      arrival_time: next,
                    }));
                  }}
                  aria-label="Horário de chegada"
                />
              </div>
            ) : (
              <div>
                <FormLabel optional>Tipo</FormLabel>
                <Select
                  value={category}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      category: v as TripActivityCategory,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.keys(
                        ACTIVITY_CATEGORY_LABELS
                      ) as TripActivityCategory[]
                    ).map((key) => (
                      <SelectItem key={key} value={key}>
                        {ACTIVITY_CATEGORY_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {canEstimateMode ? (
            <div className="space-y-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!canEstimate || estimating}
                onClick={() => void handleEstimateTimes()}
              >
                {estimating ? "Estimando…" : "Estimar horário pela rota"}
              </Button>
              {!hasRoute ? (
                <p className="text-xs text-muted-foreground">
                  Origem e destino precisam de coordenadas para estimar.
                </p>
              ) : !hasDepart && !hasArrive ? (
                <p className="text-xs text-muted-foreground">
                  Preencha a saída ou a chegada; o botão calcula o outro e o
                  tempo de viagem.
                </p>
              ) : null}
              {estimateNote ? (
                <p className="text-xs text-muted-foreground">{estimateNote}</p>
              ) : null}
            </div>
          ) : null}

          <div>
            <FormLabel optional>
              {category === "transport" ? "Link da passagem" : "Link"}
            </FormLabel>
            <Input
              value={form.link_url}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, link_url: e.target.value }))
              }
              placeholder={
                category === "transport"
                  ? "https://… (voo, trem, ônibus)"
                  : "https://…"
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_reserved}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  is_reserved: e.target.checked,
                }))
              }
              className="size-4 rounded border"
            />
            Já reservado
          </label>
          <div>
            <FormLabel optional>Notas</FormLabel>
            <Input
              value={form.notes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, notes: e.target.value }))
              }
            />
          </div>
          <Button onClick={() => onSave(form)} className="w-full">
            {isCreate ? "Adicionar" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
