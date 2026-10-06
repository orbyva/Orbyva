import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OptionalTimeInput } from "@/components/OptionalTimeInput";
import { FormField, FormFieldRow } from "@/components/FormField";
import {
  FormDialogShell,
  FormFooter,
} from "@/components/FormDialogShell";
import { FormSection } from "@/components/FormSection";
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
  transportModeHasBoarding,
  type TransferEndpoint,
  type TripTransportMode,
} from "@/domain/travel/transportModes";
import { ActivityAssetDraftsField } from "./ActivityAssetDraftsField";
import type { ActivityAssetDraft } from "@/domain/travel/activityAssetDrafts";
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
  /** Embarque (feature 102) — só chega preenchido/salvo em modo com portão. */
  boarding_time: string;
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
  /**
   * Assets a anexar assim que a linha existir (feature 257) — só em modo `create`.
   *
   * Nada aqui foi ao banco: upload precisa de `activity_id`, que só nasce no insert. Quem grava é o
   * `TripDetail`, com `createActivityAssetDrafts`, logo depois de criar a atividade. Em modo `edit`
   * a lista fica vazia e a seção não aparece — lá quem manda é o clipe do card, que já sabe abrir,
   * renomear e excluir.
   */
  asset_drafts: ActivityAssetDraft[];
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
  // Embarque só nos modos com portão (voo, trem, ônibus). A regra é do domínio para o card e o
  // formulário concordarem sem repetir a lista.
  const hasBoarding = transportModeHasBoarding(transportMode);
  const hasDepart = Boolean(form.activity_time.trim());
  const hasArrive = Boolean(form.arrival_time.trim());
  const canEstimate =
    canEstimateMode && hasRoute && (hasDepart || hasArrive);

  const dialogTitle = isCreate
    ? form.category === "transport"
      ? "Adicionar deslocamento"
      : "Adicionar evento"
    : form.category === "transport"
      ? "Editar deslocamento"
      : "Editar evento";

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
      <FormDialogShell
        title={dialogTitle}
        footer={
          <FormFooter
            onCancel={() => onOpenChange(false)}
            onSubmit={() => onSave(form)}
            submitLabel={isCreate ? "Adicionar" : "Salvar"}
          />
        }
      >
        <FormSection
          title={category === "transport" ? "Rota" : "Local"}
        >
          {category === "transport" ? (
            <>
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
              <FormField
                label="Destino"
                required
                hint='País, estado ou cidade, obrigatórios. O nome fica "Origem → Destino".'
              >
                <PlaceCatalogSearch
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
              </FormField>
            </>
          ) : (
            <FormField
              label="Local"
              hint={
                !linkedLabel
                  ? "Busque o local para calcular o trajeto no roteiro."
                  : undefined
              }
            >
              <PlaceCatalogSearch
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
            </FormField>
          )}
        </FormSection>

        <FormSection title="Detalhes">
          {category !== "transport" ? (
            <FormField label="Título" required>
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
              />
            </FormField>
          ) : null}

          {category === "transport" ? (
            <FormField label="Modo" hint={transportModeHint(transportMode)}>
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
            </FormField>
          ) : null}

          <FormFieldRow>
            <FormField
              label={category === "transport" ? "Saída" : "Horário"}
              optional
            >
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
            </FormField>
            {category === "transport" ? (
              <FormField label="Chegada" optional>
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
              </FormField>
            ) : (
              <FormField label="Tipo">
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
              </FormField>
            )}
          </FormFieldRow>

          {category === "transport" && hasBoarding ? (
            // Fora da `FormFieldRow` de cima de propósito: ali os dois campos são as pontas do
            // trajeto (saída e chegada), e embarque não é ponta de trajeto — é o horário que decide
            // quando sair do hotel.
            <FormField
              label="Embarque"
              optional
              hint="Fecha antes da partida e varia por companhia — não dá para calcular."
            >
              <OptionalTimeInput
                value={form.boarding_time}
                onChange={(next) =>
                  setForm((prev) => ({ ...prev, boarding_time: next }))
                }
                aria-label="Horário de embarque"
              />
            </FormField>
          ) : null}

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

          <FormField
            label={category === "transport" ? "Link da passagem" : "Link"}
            optional
          >
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
          </FormField>

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

          <FormField label="Notas" optional>
            <Input
              value={form.notes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, notes: e.target.value }))
              }
            />
          </FormField>
        </FormSection>

        {isCreate ? (
          <FormSection
            title="Assets"
            subtitle="Ingresso, voucher, cartão de embarque, link do check-in. Entram junto quando você salvar."
          >
            <ActivityAssetDraftsField
              drafts={form.asset_drafts}
              onChange={(asset_drafts) =>
                setForm((prev) => ({ ...prev, asset_drafts }))
              }
            />
          </FormSection>
        ) : null}
      </FormDialogShell>
    </Dialog>
  );
}
