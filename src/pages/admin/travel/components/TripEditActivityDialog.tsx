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

type ActivityForm = {
  title: string;
  activity_time: string;
  notes: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ActivityForm;
  onChange: (form: ActivityForm) => void;
  onSave: () => void;
};

export function TripEditActivityDialog({
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
          <DialogTitle>Editar atividade</DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required>Título</FormLabel>
            <Input
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <FormLabel optional>Horário</FormLabel>
            <Input
              value={form.activity_time}
              onChange={(e) =>
                onChange({ ...form, activity_time: e.target.value })
              }
              placeholder="Ex: 09:30"
            />
          </div>
          <div>
            <FormLabel optional>Notas</FormLabel>
            <Input
              value={form.notes}
              onChange={(e) => onChange({ ...form, notes: e.target.value })}
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
