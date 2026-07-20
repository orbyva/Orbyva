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
import { createTrip, updateTrip } from "@/api/travel";
import { TRIP_STATUS_LABELS } from "@/domain/travel";
import type { Trip, TripCreateRequest, TripStatus } from "@/types/travel";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

function emptyTrip(): TripCreateRequest {
  return {
    title: "",
    destination: "",
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
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isEditing = !!trip;

  useEffect(() => {
    if (!open) return;
    if (trip) {
      setForm({
        title: trip.title,
        destination: trip.destination ?? "",
        start_date: trip.start_date,
        end_date: trip.end_date,
        budget: trip.budget ?? null,
        spent: trip.spent ?? 0,
        notes: trip.notes ?? "",
        status: trip.status,
      });
    } else {
      setForm(emptyTrip());
    }
  }, [open, trip]);

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

    setLoading(true);
    try {
      if (isEditing && trip) {
        await updateTrip({
          id: trip.id,
          title: form.title.trim(),
          destination: form.destination?.trim() || null,
          start_date: form.start_date,
          end_date: form.end_date,
          budget: form.budget,
          notes: form.notes?.trim() || null,
          status: form.status,
        });
        toast({ title: "Viagem atualizada!", duration: 2000 });
      } else {
        await createTrip({
          ...form,
          title: form.title.trim(),
          destination: form.destination?.trim() || null,
          notes: form.notes?.trim() || null,
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
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

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
              placeholder="Ex: Gramado 2026"
            />
          </div>
          <div>
            <FormLabel optional>Destino</FormLabel>
            <Input
              value={form.destination ?? ""}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
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
                    start_date: d ? d.toISOString().split("T")[0] : form.start_date,
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
          <div>
            <FormLabel optional>Orçamento (R$)</FormLabel>
            <Input
              type="number"
              value={form.budget ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  budget: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>
          {isEditing && (
            <div>
              <FormLabel>Status</FormLabel>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as TripStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIP_STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <FormLabel optional>Notas</FormLabel>
            <Input
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Observações da viagem"
            />
          </div>
          {!isEditing && (
            <p className="text-xs text-muted-foreground">
              Ao criar, um roteiro dia a dia será gerado automaticamente.
            </p>
          )}
          <Button onClick={handleSave} className="w-full" disabled={loading}>
            {loading
              ? "Salvando..."
              : isEditing
                ? "Salvar alterações"
                : "Criar viagem"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
