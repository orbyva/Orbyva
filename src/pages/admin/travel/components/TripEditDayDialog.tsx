import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/FormField";
import {
  FormDialogShell,
  FormFooter,
} from "@/components/FormDialogShell";
import { FormSection } from "@/components/FormSection";
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
      <FormDialogShell
        title="Editar dia do roteiro"
        footer={
          <FormFooter
            onCancel={() => onOpenChange(false)}
            onSubmit={() => onSave(form)}
            submitLabel="Salvar"
          />
        }
      >
        <FormSection title="Essencial">
          <FormField label="Título">
            <Input
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
            />
          </FormField>
          <FormField label="Notas" optional>
            <Input
              value={form.notes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Observações do dia"
            />
          </FormField>
          <FormField
            label="Parada deste dia"
            hint="País, estado ou cidade. Se a parada atual cobrir vários dias, o intervalo é partido e este dia fica com a cidade escolhida."
          >
            <PlaceCatalogSearch
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
          </FormField>
        </FormSection>
      </FormDialogShell>
    </Dialog>
  );
}
