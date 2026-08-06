import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { PlaceCatalogSearch } from "@/components/PlaceCatalogSearch";
import { TripWeatherPackingPanel } from "@/components/TripWeatherPanels";
import { createTrip, fetchTripStops, updateTrip } from "@/api/travel";
import { TRIP_STATUS_LABELS } from "@/domain/travel";
import {
  draftFromLegacyTrip,
  draftsFromStops,
  emptyStopDraft,
  validateTripStops,
  type TripStopDraft,
} from "@/domain/travel/tripStops";
import type { Trip, TripCreateRequest, TripStatus } from "@/types/travel";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

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
  trip?: Trip | null;
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
  const { toast } = useToast();
  const isEditing = !!trip;

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
        try {
          const remote = await fetchTripStops(trip.id);
          if (cancelled) return;
          if (remote.length > 0) {
            setStops(draftsFromStops(remote));
          } else {
            setStops(
              draftFromLegacyTrip({
                destination: trip.destination,
                destination_lat: trip.destination_lat,
                destination_lng: trip.destination_lng,
                destination_place_id: trip.destination_place_id,
                start_date: trip.start_date,
                end_date: trip.end_date,
              })
            );
          }
        } catch {
          if (cancelled) return;
          setStops(
            draftFromLegacyTrip({
              destination: trip.destination,
              destination_lat: trip.destination_lat,
              destination_lng: trip.destination_lng,
              destination_place_id: trip.destination_place_id,
              start_date: trip.start_date,
              end_date: trip.end_date,
            })
          );
        }
      } else {
        const base = emptyTrip();
        setForm(base);
        setStops([emptyStopDraft(base.start_date, base.end_date, 0)]);
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

  async function handleSave() {
    if (!form.title.trim()) return;
    if (form.end_date < form.start_date) {
      toast({
        title: "Datas inválidas",
        description: "A data de fim deve ser igual ou posterior ao início.",
        variant: "destructive",
      });
      return;
    }

    const stopPayload = stops.map((s, i) => ({
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
      };
      if (isEditing && trip) {
        await updateTrip({ id: trip.id, ...payload });
        toast({ title: "Viagem atualizada!", duration: 2000 });
      } else {
        await createTrip({
          ...form,
          ...payload,
          spent: form.spent ?? 0,
        });
        toast({
          title: "Viagem criada!",
          description: "Roteiro dia a dia gerado automaticamente.",
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
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar viagem" : "Nova viagem"}</DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required>Título</FormLabel>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Eurotrip 2026"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel required>Início</FormLabel>
              <DatePicker
                date={new Date(`${form.start_date}T12:00:00`)}
                onSelect={(d) =>
                  setForm({
                    ...form,
                    start_date: d
                      ? d.toISOString().split("T")[0]
                      : form.start_date,
                  })
                }
              />
            </div>
            <div>
              <FormLabel required>Fim</FormLabel>
              <DatePicker
                date={new Date(`${form.end_date}T12:00:00`)}
                onSelect={(d) =>
                  setForm({
                    ...form,
                    end_date: d ? d.toISOString().split("T")[0] : form.end_date,
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <FormLabel required>Paradas</FormLabel>
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
            <p className="text-xs text-muted-foreground">
              País, estado ou cidade — com datas em cada parada (ex.: Madrid →
              Berlim → Paris).
            </p>
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
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FormLabel>Chegada</FormLabel>
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
                  </div>
                  <div>
                    <FormLabel>Saída</FormLabel>
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
                  </div>
                </div>
              </div>
            ))}
          </div>

          <TripWeatherPackingPanel stops={packingStops} />

          <div>
            <FormLabel optional>Orçamento</FormLabel>
            <MoneyInput
              value={form.budget ?? null}
              onChange={(v) =>
                setForm({ ...form, budget: v === "" ? null : v })
              }
            />
          </div>
          <div>
            <FormLabel optional>Status</FormLabel>
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
          </div>
          <div>
            <FormLabel optional>Notas</FormLabel>
            <Input
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <Button onClick={() => void handleSave()} disabled={loading} className="w-full">
            {loading
              ? "Salvando…"
              : isEditing
                ? "Salvar alterações"
                : "Criar viagem"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
