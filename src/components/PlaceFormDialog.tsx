import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { ExpenseCategoryPicker } from "@/components/ExpenseCategoryPicker";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_SEGMENT_TABS_CLASS,
  FORM_SEGMENT_TRIGGER_CLASS,
} from "@/components/FormLabel";
import { MoneyInput } from "@/components/MoneyInput";
import { StarRating } from "@/components/StarRating";
import { PlaceCatalogSearch } from "@/components/PlaceCatalogSearch";
import { PlaceVisitsPanel } from "@/components/PlaceVisitsPanel";
import {
  PLACE_TYPE_LABELS,
  normalizePlaceStatus,
  placeLedgerDescription,
} from "@/domain/places";
import { createPlace, createPlaceVisitOccurrence, updatePlace } from "@/api/places";
import { fetchTransactionClassMeta } from "@/api/finance";
import { fetchTrips } from "@/api/travel";
import { useDimensions } from "@/hooks/useDimensions";
import type {
  PlaceStatus,
  PlaceType,
  PlaceVisit,
  PlaceVisitCreateRequest,
} from "@/types/places";
import type { Trip } from "@/types/travel";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

function emptyPlace(
  tripId?: string | null,
  defaultStatus: PlaceStatus = "to_visit"
): PlaceVisitCreateRequest {
  const today = new Date().toISOString().split("T")[0];
  return {
    trip_id: tripId ?? null,
    name: "",
    type: "restaurant",
    status: defaultStatus,
    rating: null,
    notes: "",
    visited_date: defaultStatus === "visited" ? today : null,
    amount: null,
    transaction_id: null,
    address: "",
    lat: null,
    lng: null,
    google_place_id: null,
    geoapify_place_id: null,
    would_recommend: true,
  };
}

interface PlaceFormDialogProps {
  place?: PlaceVisit | null;
  tripId?: string | null;
  /** Status inicial ao criar (ex.: aba "Para visitar"). */
  defaultStatus?: PlaceStatus;
  /**
   * `create`: novo lugar (campos conforme defaultStatus).
   * `edit`: editar local + aba de visitas.
   * `register_visit`: só registrar visita (de um to_visit).
   */
  intent?: "create" | "edit" | "register_visit";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
  trigger?: React.ReactNode;
  /** Força o botão padrão quando o dialog é controlado (ex.: módulo Lugares). */
  showTrigger?: boolean;
}

export function PlaceFormDialog({
  place,
  tripId,
  defaultStatus = "to_visit",
  intent: intentProp,
  open: controlledOpen,
  onOpenChange,
  onSaved,
  trigger,
  showTrigger = false,
}: PlaceFormDialogProps) {
  const intent =
    intentProp ?? (place ? "edit" : "create");
  const lockStatus =
    intent === "register_visit" ||
    (intent === "create" && defaultStatus === "to_visit");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [form, setForm] = useState<PlaceVisitCreateRequest>(
    emptyPlace(tripId, defaultStatus)
  );
  const [trips, setTrips] = useState<Trip[]>([]);
  const [registerExpense, setRegisterExpense] = useState(false);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [classId, setClassId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editTab, setEditTab] = useState<"lugar" | "visitas">("lugar");
  const { toast } = useToast();
  const isEditing = !!place;
  const status = normalizePlaceStatus(form.status, form.visited_date);
  const hasAmount = form.amount != null && form.amount > 0;
  const linkedToLedger = Boolean(place?.transaction_id);
  const tripLocked = Boolean(tripId);
  const { dimensions } = useDimensions({ enabled: open });

  useEffect(() => {
    if (open) {
      if (!tripId) {
        fetchTrips().then(setTrips).catch(() => undefined);
      }
      if (place) {
        const s = normalizePlaceStatus(place.status, place.visited_date);
        setForm({
          trip_id: place.trip_id,
          name: place.name,
          type: place.type,
          status: s,
          rating: place.rating,
          notes: place.notes,
          visited_date: place.visited_date,
          amount: place.amount ?? null,
          transaction_id: place.transaction_id ?? null,
          address: place.address,
          lat: place.lat ?? null,
          lng: place.lng ?? null,
          google_place_id: place.google_place_id ?? null,
          geoapify_place_id: null,
          would_recommend: place.would_recommend,
        });
        setRegisterExpense(false);
        if (place.transaction_id) {
          void fetchTransactionClassMeta(place.transaction_id)
            .then((meta) => {
              if (!meta) return;
              setClassId(meta.class_id);
              setSelectedType(meta.type_id);
            })
            .catch(() => {
              setSelectedType(null);
              setClassId(0);
            });
        } else {
          setSelectedType(null);
          setClassId(0);
        }
      } else {
        setForm(emptyPlace(tripId, defaultStatus));
        setRegisterExpense(false);
        setSelectedType(null);
        setClassId(0);
      }
    }
  }, [open, place, tripId, defaultStatus]);

  function setStatus(next: PlaceStatus) {
    const today = new Date().toISOString().split("T")[0];
    setForm((prev) => ({
      ...prev,
      status: next,
      visited_date: next === "to_visit" ? null : prev.visited_date || today,
      rating: next === "to_visit" ? null : prev.rating,
      amount: next === "to_visit" ? null : prev.amount,
    }));
    if (next === "to_visit") setRegisterExpense(false);
  }

  async function handleSave() {
    if (intent !== "register_visit" && !form.name.trim()) {
      toast({ title: "Informe o nome do lugar", variant: "destructive" });
      return;
    }
    const effectiveStatus =
      intent === "register_visit" ? "visited" : status;
    if (effectiveStatus === "visited" && !form.visited_date) {
      toast({ title: "Informe a data da visita", variant: "destructive" });
      return;
    }

    const amount =
      effectiveStatus === "visited" && form.amount != null && form.amount > 0
        ? form.amount
        : null;
    const wantsNewLedger =
      !linkedToLedger && registerExpense && amount != null;
    if ((wantsNewLedger || (linkedToLedger && amount != null)) && !classId) {
      toast({
        title: "Selecione a subcategoria da despesa",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const tripTitle =
        trips.find((t) => t.id === (form.trip_id ?? undefined))?.title ??
        place?.trip?.title ??
        null;
      const description = placeLedgerDescription(
        { name: form.name || place?.name || "", type: form.type },
        tripTitle
      );
      const transactionAt = new Date(
        `${form.visited_date ?? new Date().toISOString().split("T")[0]}T12:00:00`
      ).toISOString();

      const payload: PlaceVisitCreateRequest = {
        ...form,
        name: form.name || place?.name || "",
        status: effectiveStatus,
        visited_date:
          effectiveStatus === "to_visit" ? null : form.visited_date,
        rating: effectiveStatus === "to_visit" ? null : form.rating,
        amount,
        transaction_id: place?.transaction_id ?? null,
      };

      if (isEditing && place) {
        const removeTransaction =
          linkedToLedger && (amount == null || effectiveStatus === "to_visit");
        await updatePlace(
          { id: place.id, ...payload },
          {
            removeTransaction,
            syncTransaction:
              linkedToLedger && amount != null
                ? {
                    value: amount,
                    description,
                    transaction_at: transactionAt,
                    class_id: classId > 0 ? classId : undefined,
                  }
                : null,
            transaction: wantsNewLedger
              ? {
                  class_id: classId,
                  value: amount!,
                  description,
                  transaction_at: transactionAt,
                }
              : null,
          }
        );
        if (effectiveStatus === "visited" && intent === "register_visit") {
          try {
            await createPlaceVisitOccurrence({
              place_visit_id: place.id,
              visited_date: form.visited_date!,
              rating: form.rating ?? null,
              notes: form.notes ?? null,
              amount,
              would_recommend: form.would_recommend,
            });
          } catch {
            // Tabela pode não estar migrada ainda.
          }
        }
        toast({
          title:
            intent === "register_visit"
              ? "Visita registrada!"
              : linkedToLedger && amount != null
                ? "Lugar e despesa atualizados!"
                : wantsNewLedger
                  ? "Lugar e despesa registrados!"
                  : "Lugar atualizado!",
          duration: 2000,
        });
      } else {
        const created = await createPlace(payload, {
          transaction: wantsNewLedger
            ? {
                class_id: classId,
                value: amount!,
                description,
                transaction_at: transactionAt,
              }
            : null,
        });
        if (effectiveStatus === "visited") {
          try {
            await createPlaceVisitOccurrence({
              place_visit_id: created.id,
              visited_date: form.visited_date!,
              rating: form.rating ?? null,
              notes: form.notes ?? null,
              amount,
              would_recommend: form.would_recommend,
            });
          } catch {
            // Tabela pode não estar migrada ainda.
          }
        }
        toast({
          title: wantsNewLedger
            ? "Lugar e despesa registrados!"
            : effectiveStatus === "to_visit"
              ? "Salvo em Para visitar"
              : "Lugar registrado!",
          duration: 2000,
        });
      }
      setOpen(false);
      onSaved();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar o lugar."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const isControlled = controlledOpen !== undefined;
  const showLedgerToggle =
    status === "visited" &&
    hasAmount &&
    !linkedToLedger &&
    dimensions.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      {!trigger && !isEditing && (!isControlled || showTrigger) ? (
        isControlled ? (
          <Button
            className="w-full sm:w-auto"
            type="button"
            onClick={() => setOpen(true)}
          >
            Adicionar lugar
          </Button>
        ) : (
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">Adicionar lugar</Button>
          </DialogTrigger>
        )
      ) : null}
      <DialogContent
        className={cn(FORM_DIALOG_CONTENT_CLASS, "gap-3")}
      >
        <DialogHeader className="space-y-1">
          <DialogTitle>
            {intent === "register_visit"
              ? "Registrar visita"
              : isEditing
                ? "Editar lugar"
                : defaultStatus === "visited"
                  ? "Adicionar visitado"
                  : "Adicionar para visitar"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          {intent === "edit" && place ? (
            <Tabs
              value={editTab}
              onValueChange={(v) => setEditTab(v as "lugar" | "visitas")}
              className="w-full"
            >
              <TabsList className={FORM_SEGMENT_TABS_CLASS}>
                <TabsTrigger
                  value="lugar"
                  className={FORM_SEGMENT_TRIGGER_CLASS}
                >
                  Lugar
                </TabsTrigger>
                <TabsTrigger
                  value="visitas"
                  className={FORM_SEGMENT_TRIGGER_CLASS}
                >
                  Visitas
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          {intent === "edit" && place && editTab === "visitas" ? (
            <PlaceVisitsPanel placeVisitId={place.id} onChanged={onSaved} />
          ) : (
          <>
          {!lockStatus && intent !== "edit" ? (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                status === "to_visit"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setStatus("to_visit")}
            >
              Para visitar
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                status === "visited"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setStatus("visited")}
            >
              Visitado
            </button>
          </div>
          ) : null}

          {intent === "register_visit" ? (
            <p className="text-sm text-muted-foreground">
              {form.name || place?.name}
              {form.address ? ` · ${form.address}` : null}
            </p>
          ) : null}

          {intent !== "register_visit" ? (
          <>
          <div>
            <PlaceCatalogSearch
              selectedLabel={
                form.google_place_id || form.lat != null
                  ? form.name || null
                  : null
              }
              onClear={() =>
                setForm((prev) => ({
                  ...prev,
                  geoapify_place_id: null,
                  google_place_id: null,
                  lat: null,
                  lng: null,
                }))
              }
              onPick={(hit) =>
                setForm((prev) => ({
                  ...prev,
                  name: hit.name,
                  address: hit.address ?? "",
                  lat: hit.lat,
                  lng: hit.lng,
                  geoapify_place_id: null,
                  google_place_id: hit.google_place_id,
                  type: hit.type,
                }))
              }
            />
          </div>

          <div>
            <FormLabel required>Nome</FormLabel>
            <Input
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                  // Digitação manual invalida o vínculo de mapa.
                  google_place_id: null,
                  geoapify_place_id: null,
                  lat: null,
                  lng: null,
                })
              }
            />
          </div>

          <div
            className={cn(
              "grid gap-3",
              tripLocked ? "grid-cols-1" : "grid-cols-2"
            )}
          >
            <div>
              <FormLabel required>Tipo</FormLabel>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm({ ...form, type: v as PlaceType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLACE_TYPE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!tripLocked ? (
              <div>
                <FormLabel optional>Viagem</FormLabel>
                <Select
                  value={form.trip_id ?? "none"}
                  onValueChange={(v) =>
                    setForm({ ...form, trip_id: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Local" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem viagem</SelectItem>
                    {trips.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          </>
          ) : null}

          {(status === "visited" || intent === "register_visit") ? (
            <>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <FormLabel optional>Nota</FormLabel>
                  <StarRating
                    value={form.rating ?? 0}
                    onChange={(r) => setForm({ ...form, rating: r })}
                    allowHalf
                  />
                </div>
                <div className="shrink-0">
                  <FormLabel>Recomendaria</FormLabel>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant={form.would_recommend ? "default" : "outline"}
                      className="h-9 w-9"
                      aria-label="Recomendaria"
                      onClick={() =>
                        setForm({ ...form, would_recommend: true })
                      }
                    >
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant={
                        !form.would_recommend ? "destructive" : "outline"
                      }
                      className="h-9 w-9"
                      aria-label="Não recomendaria"
                      onClick={() =>
                        setForm({ ...form, would_recommend: false })
                      }
                    >
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FormLabel required>Data</FormLabel>
                  <DatePicker
                    date={
                      form.visited_date
                        ? new Date(`${form.visited_date}T12:00:00`)
                        : undefined
                    }
                    onSelect={(d) =>
                      setForm({
                        ...form,
                        visited_date: d
                          ? d.toISOString().split("T")[0]
                          : form.visited_date,
                      })
                    }
                  />
                </div>
                <div>
                  <FormLabel optional>Valor</FormLabel>
                  <MoneyInput
                    value={form.amount ?? ""}
                    onChange={(value) => {
                      const next = value === "" ? null : value;
                      setForm({ ...form, amount: next });
                      if (next == null || next <= 0) setRegisterExpense(false);
                    }}
                  />
                </div>
              </div>
            </>
          ) : null}

          <div>
            <FormLabel optional>Endereço</FormLabel>
            <Input
              placeholder="Rua, bairro..."
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>

          <div>
            <FormLabel optional>
              {status === "visited" ? "Comentário" : "Notas"}
            </FormLabel>
            <Input
              placeholder={
                status === "visited"
                  ? "Pratos, ambiente..."
                  : "Por que quer ir..."
              }
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {linkedToLedger && hasAmount ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Nos lançamentos — salvar atualiza o registro
              </p>
              {dimensions.length > 0 ? (
                <ExpenseCategoryPicker
                  dimensions={dimensions}
                  selectedType={selectedType}
                  classId={classId}
                  onTypeChange={setSelectedType}
                  onClassChange={setClassId}
                />
              ) : null}
            </div>
          ) : null}

          {status === "visited" &&
          hasAmount &&
          Boolean(form.trip_id) &&
          !linkedToLedger ? (
            <p className="text-xs text-muted-foreground">
              O valor entra nos gastos da viagem
              {showLedgerToggle ? " (e nos lançamentos, se marcar abaixo)" : ""}.
            </p>
          ) : null}

          {showLedgerToggle ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={registerExpense}
                  onChange={(e) => setRegisterExpense(e.target.checked)}
                  className="rounded"
                />
                Registrar em Finanças
              </label>
              {registerExpense ? (
                <ExpenseCategoryPicker
                  dimensions={dimensions}
                  selectedType={selectedType}
                  classId={classId}
                  onTypeChange={setSelectedType}
                  onClassChange={setClassId}
                />
              ) : null}
            </div>
          ) : null}

          <div
            className={
              intent === "register_visit" ? "flex flex-col gap-2" : undefined
            }
          >
            <Button onClick={handleSave} disabled={loading} className="w-full">
              {loading
                ? "Salvando…"
                : intent === "register_visit"
                  ? "Registrar visita"
                  : isEditing
                    ? "Salvar alterações"
                    : "Adicionar lugar"}
            </Button>
            {intent === "register_visit" ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                disabled={loading}
                onClick={() => setOpen(false)}
              >
                Pular avaliação
              </Button>
            ) : null}
          </div>
          </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
