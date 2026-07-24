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
import { DatePicker } from "@/components/DatePicker";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
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
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar prazo" : "Adicionar prazo"}
          </DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required>Título</FormLabel>
            <Input
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
              placeholder="Ex: Check-in voo, Reserva hotel..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel>Tipo</FormLabel>
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
            </div>
            <div>
              <FormLabel>Data limite</FormLabel>
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
            </div>
          </div>
          <div>
            <FormLabel optional>Notas</FormLabel>
            <Input
              value={form.notes}
              onChange={(e) => onChange({ ...form, notes: e.target.value })}
            />
          </div>
          <Button onClick={onSave} className="w-full">
            {editing ? "Salvar alterações" : "Adicionar prazo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
