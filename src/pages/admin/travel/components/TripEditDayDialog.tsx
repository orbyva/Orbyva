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

type DayForm = { title: string; notes: string };

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
          <Button onClick={onSave} className="w-full">
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
