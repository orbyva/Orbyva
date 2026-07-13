import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { StarRating } from "@/components/StarRating";
import { PLACE_TYPE_LABELS, formatRating } from "@/domain/places";
import { createPlace, updatePlace } from "@/api/places";
import { fetchTrips } from "@/api/travel";
import type { PlaceType, PlaceVisit, PlaceVisitCreateRequest } from "@/types/places";
import type { Trip } from "@/types/travel";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

function emptyPlace(tripId?: string | null): PlaceVisitCreateRequest {
  return {
    trip_id: tripId ?? null,
    name: "",
    type: "restaurant",
    rating: null,
    notes: "",
    visited_date: new Date().toISOString().split("T")[0],
    address: "",
    would_recommend: true,
  };
}

interface PlaceFormDialogProps {
  place?: PlaceVisit | null;
  tripId?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
  trigger?: React.ReactNode;
}

export function PlaceFormDialog({
  place,
  tripId,
  open: controlledOpen,
  onOpenChange,
  onSaved,
  trigger,
}: PlaceFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [form, setForm] = useState<PlaceVisitCreateRequest>(emptyPlace(tripId));
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isEditing = !!place;

  useEffect(() => {
    if (open) {
      fetchTrips().then(setTrips).catch(() => undefined);
      if (place) {
        setForm({
          trip_id: place.trip_id,
          name: place.name,
          type: place.type,
          rating: place.rating,
          notes: place.notes,
          visited_date: place.visited_date,
          address: place.address,
          would_recommend: place.would_recommend,
        });
      } else {
        setForm(emptyPlace(tripId));
      }
    }
  }, [open, place, tripId]);

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Informe o nome do lugar", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      if (isEditing && place) {
        await updatePlace({ id: place.id, ...form });
      } else {
        await createPlace(form);
      }
      toast({ title: isEditing ? "Lugar atualizado!" : "Lugar registrado!", duration: 2000 });
      setOpen(false);
      onSaved();
    } catch (error) {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {!trigger && !isEditing && (
        <DialogTrigger asChild>
          <Button>Avaliar lugar</Button>
        </DialogTrigger>
      )}
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar lugar" : "Avaliar lugar"}
          </DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required>Nome</FormLabel>
            <Input
              placeholder="Ex: Restaurante X, Parque Y..."
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <FormLabel required>Tipo</FormLabel>
            <Select
              value={form.type}
              onValueChange={(v) => setForm({ ...form, type: v as PlaceType })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PLACE_TYPE_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FormLabel optional>Nota</FormLabel>
            <div className="space-y-2">
              <StarRating
                value={form.rating ?? 0}
                onChange={(r) => setForm({ ...form, rating: r })}
                allowHalf
              />
              {form.rating != null && form.rating > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatRating(form.rating)} estrelas — clique na metade esquerda da estrela para meia nota
                </p>
              )}
            </div>
          </div>
          <div>
            <FormLabel required>Data da visita</FormLabel>
            <DatePicker
              date={new Date(`${form.visited_date}T12:00:00`)}
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
            <FormLabel optional>Endereço</FormLabel>
            <Input
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <FormLabel optional>Viagem</FormLabel>
            <Select
              value={form.trip_id ?? "none"}
              onValueChange={(v) =>
                setForm({ ...form, trip_id: v === "none" ? null : v })
              }
            >
              <SelectTrigger><SelectValue placeholder="Passeio local" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Passeio local (sem viagem)</SelectItem>
                {trips.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FormLabel optional>O que achou?</FormLabel>
            <Input
              placeholder="Pratos, ambiente, dicas..."
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.would_recommend}
              onChange={(e) =>
                setForm({ ...form, would_recommend: e.target.checked })
              }
              className="rounded"
            />
            Recomendaria
          </label>
          <Button onClick={handleSave} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
