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

type DayForm = {
  title: string;
  notes: string;
  stop: TripStopInput | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: DayForm;
  onChange: (form: DayForm) => void;
  onSave: () => void;
};

export function TripEditDayDialog({
  open,
  onOpenChange,
  form,
  onChange,
  onSave,
}: Props) {
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
              onChange={(e) => onChange({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <FormLabel optional>Notas</FormLabel>
            <Input
              value={form.notes}
              onChange={(e) => onChange({ ...form, notes: e.target.value })}
              placeholder="Observações do dia"
            />
          </div>
          <div className="space-y-1">
            <PlaceCatalogSearch
              label="Parada deste dia"
              scope="regions"
              selectedLabel={form.stop?.name ?? null}
              onClear={() => onChange({ ...form, stop: null })}
              onPick={(hit) =>
                onChange({
                  ...form,
                  stop: {
                    name: hit.name.trim(),
                    place_id: hit.google_place_id?.trim() || null,
                    lat: hit.lat ?? null,
                    lng: hit.lng ?? null,
                    start_date: form.stop?.start_date ?? "",
                    end_date: form.stop?.end_date ?? "",
                  },
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              País, estado ou cidade. Se a parada atual cobrir vários dias, o
              intervalo é partido e este dia fica com a cidade escolhida.
            </p>
          </div>
          <Button onClick={onSave} className="w-full">
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
