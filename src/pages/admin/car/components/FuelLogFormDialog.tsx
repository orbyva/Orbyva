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
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { DatePicker } from "@/components/DatePicker";
import type { FuelLog, FuelLogCreateRequest, Vehicle } from "@/types/car";
import { createFuelLog, updateFuelLog } from "@/api/car";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

function emptyFuelLog(vehicleId: string): FuelLogCreateRequest {
  return {
    vehicle_id: vehicleId,
    date: new Date().toISOString().split("T")[0],
    liters: 0,
    total_cost: 0,
    km: 0,
    station: "",
    notes: "",
  };
}

interface FuelLogFormDialogProps {
  vehicle: Vehicle;
  fuelLog?: FuelLog | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
}

export function FuelLogFormDialog({
  vehicle,
  fuelLog,
  open: controlledOpen,
  onOpenChange,
  onSaved,
}: FuelLogFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [form, setForm] = useState<FuelLogCreateRequest>(
    fuelLog ? { ...fuelLog } : emptyFuelLog(vehicle.id)
  );
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isEditing = !!fuelLog;

  useEffect(() => {
    if (open && fuelLog) setForm({ ...fuelLog });
    else if (open && !fuelLog) {
      setForm({
        ...emptyFuelLog(vehicle.id),
        km: vehicle.current_km,
      });
    }
  }, [open, fuelLog, vehicle.id, vehicle.current_km]);

  async function handleSave() {
    if (!form.date) return setFormError("Informe a data.");
    if (form.liters <= 0) return setFormError("Informe os litros.");
    if (form.total_cost <= 0) return setFormError("Informe o valor.");
    if (form.km <= 0) return setFormError("Informe o km.");

    setFormError("");
    setLoading(true);

    try {
      if (isEditing && fuelLog) {
        await updateFuelLog({ id: fuelLog.id, ...form });
      } else {
        await createFuelLog(form);
      }

      toast({
        title: "Sucesso",
        description: isEditing
          ? "Abastecimento atualizado!"
          : "Abastecimento registrado!",
        duration: 2000,
      });

      setOpen(false);
      onSaved();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao salvar abastecimento."),
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
          <Button variant="outline">Registrar abastecimento</Button>
        </DialogTrigger>
      )}
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar abastecimento" : "Registrar abastecimento"}
          </DialogTitle>
        </DialogHeader>

        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required>Data</FormLabel>
            <DatePicker
              date={
                form.date
                  ? new Date(`${form.date}T12:00:00`)
                  : undefined
              }
              onSelect={(d) =>
                setForm({
                  ...form,
                  date: d ? d.toISOString().split("T")[0] : form.date,
                })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel required>Litros</FormLabel>
              <Input
                type="number"
                step="0.001"
                value={form.liters || ""}
                onChange={(e) =>
                  setForm({ ...form, liters: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <FormLabel required>Valor total (R$)</FormLabel>
              <Input
                type="number"
                step="0.01"
                value={form.total_cost || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    total_cost: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel required>Km no abastecimento</FormLabel>
              <Input
                type="number"
                value={form.km || ""}
                onChange={(e) =>
                  setForm({ ...form, km: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <FormLabel optional>Posto</FormLabel>
              <Input
                value={form.station ?? ""}
                onChange={(e) => setForm({ ...form, station: e.target.value })}
              />
            </div>
          </div>
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
