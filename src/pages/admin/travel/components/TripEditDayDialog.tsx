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
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { PlaceCatalogSearch } from "@/components/PlaceCatalogSearch";
import type { TripStopInput } from "@/domain/travel/tripStops";

export type DayForm = {
  title: string;
  notes: string;
  stop: TripStopInput | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: DayForm;
  onSave: (form: DayForm) => void;
};

export function TripEditDayDialog({
  open,
  onOpenChange,
  form: seed,
  onSave,
}: Props) {
  const [form, setForm] = useState(seed);

  useEffect(() => {
    if (!open) return;
    setForm(seed);
  }, [open, seed]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>Editar dia do roteiro</DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel>Título</FormLabel>
            <Input
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
            />
          </div>
          <div>
            <FormLabel optional>Notas</FormLabel>
            <Input
              value={form.notes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Observações do dia"
            />
          </div>
          <div className="space-y-1">
            <PlaceCatalogSearch
              label="Parada deste dia"
              scope="regions"
              requestUserLocation={false}
              selectedLabel={form.stop?.name ?? null}
              onClear={() => setForm((prev) => ({ ...prev, stop: null }))}
              onPick={(hit) =>
                setForm((prev) => ({
                  ...prev,
                  stop: {
                    name: hit.name.trim(),
                    place_id: hit.google_place_id?.trim() || null,
                    lat: hit.lat ?? null,
                    lng: hit.lng ?? null,
                    start_date: prev.stop?.start_date ?? "",
                    end_date: prev.stop?.end_date ?? "",
                  },
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              País, estado ou cidade. Se a parada atual cobrir vários dias, o
              intervalo é partido e este dia fica com a cidade escolhida.
            </p>
          </div>
          <Button onClick={() => onSave(form)} className="w-full">
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
