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
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { DatePicker } from "@/components/DatePicker";
import type {
  DocumentType,
  Vehicle,
  VehicleDocument,
  VehicleDocumentCreateRequest,
} from "@/types/car";
import { DOCUMENT_TYPE_LABELS } from "@/domain/car";
import { createDocument, updateDocument } from "@/api/car";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

function emptyDocument(vehicleId: string): VehicleDocumentCreateRequest {
  return {
    vehicle_id: vehicleId,
    type: "ipva",
    custom_type: null,
    due_date: new Date().toISOString().split("T")[0],
    cost: null,
    paid: false,
    paid_date: null,
    notes: "",
  };
}

interface DocumentFormDialogProps {
  vehicle: Vehicle;
  document?: VehicleDocument | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
}

export function DocumentFormDialog({
  vehicle,
  document,
  open: controlledOpen,
  onOpenChange,
  onSaved,
}: DocumentFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [form, setForm] = useState<VehicleDocumentCreateRequest>(
    document ? { ...document } : emptyDocument(vehicle.id)
  );
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isEditing = !!document;

  useEffect(() => {
    if (open && document) setForm({ ...document });
    else if (open && !document) setForm(emptyDocument(vehicle.id));
  }, [open, document, vehicle.id]);

  async function handleSave() {
    if (!form.due_date) return setFormError("Informe a data de vencimento.");
    if (form.type === "other" && !form.custom_type?.trim()) {
      return setFormError("Informe a descrição do documento.");
    }

    setFormError("");
    setLoading(true);

    try {
      if (isEditing && document) {
        await updateDocument({ id: document.id, ...form });
      } else {
        await createDocument(form);
      }

      toast({
        title: "Sucesso",
        description: isEditing ? "Documento atualizado!" : "Documento registrado!",
        duration: 2000,
      });

      setOpen(false);
      onSaved();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao salvar documento."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEditing && (
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full sm:w-auto">
            Adicionar documento
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar documento" : "Adicionar documento"}
          </DialogTitle>
        </DialogHeader>

        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required>Tipo</FormLabel>
            <Select
              value={form.type}
              onValueChange={(v) =>
                setForm({ ...form, type: v as DocumentType })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.type === "other" && (
            <div>
              <FormLabel required>Descrição</FormLabel>
              <Input
                value={form.custom_type ?? ""}
                onChange={(e) =>
                  setForm({ ...form, custom_type: e.target.value })
                }
              />
            </div>
          )}

          <div>
            <FormLabel required>Vencimento</FormLabel>
            <DatePicker
              date={
                form.due_date
                  ? new Date(`${form.due_date}T12:00:00`)
                  : undefined
              }
              onSelect={(d) =>
                setForm({
                  ...form,
                  due_date: d
                    ? d.toISOString().split("T")[0]
                    : form.due_date,
                })
              }
            />
          </div>

          <div>
            <FormLabel optional>Valor (R$)</FormLabel>
            <Input
              type="number"
              step="0.01"
              value={form.cost ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  cost: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.paid}
              onChange={(e) =>
                setForm({
                  ...form,
                  paid: e.target.checked,
                  paid_date: e.target.checked
                    ? new Date().toISOString().split("T")[0]
                    : null,
                })
              }
              className="rounded"
            />
            Já pago
          </label>

          {formError && (
            <p className="text-sm text-destructive">{formError}</p>
          )}
          <Button onClick={handleSave} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
