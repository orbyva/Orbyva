import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { FormField, FormFieldRow } from "@/components/FormField";
import {
  FormDialogShell,
  FormFooter,
} from "@/components/FormDialogShell";
import { FormSection } from "@/components/FormSection";
import { MILESTONE_TYPE_LABELS } from "@/domain/travel";
import type { TripMilestoneType } from "@/types/travel";

export type TripMilestoneFormState = {
  title: string;
  type: TripMilestoneType;
  due_date: string;
  notes: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: TripMilestoneFormState;
  onChange: (form: TripMilestoneFormState) => void;
  onSave: () => void;
};

export function TripMilestoneFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  onChange,
  onSave,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FormDialogShell
        title={editing ? "Editar prazo" : "Adicionar prazo"}
        footer={
          <FormFooter
            onCancel={() => onOpenChange(false)}
            onSubmit={onSave}
            submitLabel={
              editing ? "Salvar alterações" : "Adicionar prazo"
            }
          />
        }
      >
        <FormSection title="Essencial">
          <FormField label="Título" required>
            <Input
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
              placeholder="Ex: Check-in voo, Reserva hotel..."
            />
          </FormField>
          <FormFieldRow>
            <FormField label="Tipo">
              <Select
                value={form.type}
                onValueChange={(v) =>
                  onChange({
                    ...form,
                    type: v as TripMilestoneType,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MILESTONE_TYPE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Data limite">
              <DatePicker
                date={new Date(`${form.due_date}T12:00:00`)}
                onSelect={(d) =>
                  onChange({
                    ...form,
                    due_date: d
                      ? d.toISOString().split("T")[0]
                      : form.due_date,
                  })
                }
              />
            </FormField>
          </FormFieldRow>
          <FormField label="Notas" optional>
            <Input
              value={form.notes}
              onChange={(e) => onChange({ ...form, notes: e.target.value })}
            />
          </FormField>
        </FormSection>
      </FormDialogShell>
    </Dialog>
  );
}
