import { useEffect, useMemo, useState } from "react";
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
import type { Dimension } from "@/types/dimensions";
import type { FuelLog, FuelLogCreateRequest, Vehicle } from "@/types/car";
import {
  estimateConsumptionFromPrevious,
  getLatestFuelLogKm,
} from "@/domain/car";
import { createFuelLog, updateFuelLog } from "@/api/car";
import { ExpenseCategoryPicker } from "./ExpenseCategoryPicker";
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
    transaction_id: null,
  };
}

function fuelExpenseDescription(
  vehicle: Vehicle,
  station?: string | null
): string {
  return station?.trim()
    ? `Abastecimento: ${station.trim()}`
    : `Abastecimento: ${vehicle.brand} ${vehicle.model}`;
}

interface FuelLogFormDialogProps {
  vehicle: Vehicle;
  fuelLog?: FuelLog | null;
  /** Logs existentes (para estimar km/l e último km). */
  existingLogs?: FuelLog[];
  dimensions?: Dimension[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
}

export function FuelLogFormDialog({
  vehicle,
  fuelLog,
  existingLogs = [],
  dimensions = [],
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
  const [registerExpense, setRegisterExpense] = useState(true);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [classId, setClassId] = useState(0);
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isEditing = !!fuelLog;

  const previousKm = useMemo(() => {
    const logs = isEditing
      ? existingLogs.filter((l) => l.id !== fuelLog?.id)
      : existingLogs;
    return getLatestFuelLogKm(logs);
  }, [existingLogs, fuelLog?.id, isEditing]);

  const estimatedConsumption = useMemo(
    () =>
      estimateConsumptionFromPrevious(previousKm, form.km, form.liters),
    [previousKm, form.km, form.liters]
  );

  useEffect(() => {
    if (open && fuelLog) {
      setForm({ ...fuelLog });
      setRegisterExpense(false);
    } else if (open && !fuelLog) {
      setForm({
        ...emptyFuelLog(vehicle.id),
        km: Math.max(vehicle.current_km, previousKm ?? 0),
      });
      setRegisterExpense(true);
      setSelectedType(null);
      setClassId(0);
    }
    if (open) setFormError("");
  }, [open, fuelLog, vehicle.id, vehicle.current_km, previousKm]);

  async function handleSave() {
    if (!form.date) return setFormError("Informe a data.");
    if (form.liters <= 0) return setFormError("Informe os litros.");
    if (form.total_cost <= 0) return setFormError("Informe o valor.");
    if (form.km <= 0) return setFormError("Informe o km.");
    if (previousKm != null && form.km < previousKm) {
      return setFormError(
        `Km deve ser maior ou igual ao último registro (${previousKm.toLocaleString("pt-BR")} km).`
      );
    }
    if (registerExpense && !isEditing) {
      if (!classId) return setFormError("Selecione a categoria da despesa.");
    }

    setFormError("");
    setLoading(true);

    try {
      const description = fuelExpenseDescription(vehicle, form.station);
      const transactionAt = new Date(`${form.date}T12:00:00`).toISOString();

      if (isEditing && fuelLog) {
        await updateFuelLog(
          { id: fuelLog.id, ...form },
          {
            updateVehicleKm: true,
            syncTransaction: fuelLog.transaction_id
              ? {
                  value: form.total_cost,
                  description,
                  transaction_at: transactionAt,
                }
              : null,
          }
        );
      } else {
        const transaction =
          registerExpense && form.total_cost > 0
            ? {
                class_id: classId,
                value: form.total_cost,
                description,
                transaction_at: transactionAt,
              }
            : null;

        await createFuelLog(form, {
          transaction,
          updateVehicleKm: true,
        });
      }

      toast({
        title: "Sucesso",
        description: isEditing
          ? fuelLog?.transaction_id
            ? "Abastecimento e despesa atualizados!"
            : "Abastecimento atualizado!"
          : registerExpense
            ? "Abastecimento e despesa registrados!"
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
          <Button variant="outline" className="w-full sm:w-auto">
            Registrar abastecimento
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className={`${FORM_DIALOG_CONTENT_CLASS} max-h-[90vh] overflow-y-auto`}
      >
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
                form.date ? new Date(`${form.date}T12:00:00`) : undefined
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
              <p className="mt-1 text-xs text-muted-foreground">
                Atualiza a quilometragem do veículo se for maior.
              </p>
            </div>
            <div>
              <FormLabel optional>Posto</FormLabel>
              <Input
                value={form.station ?? ""}
                onChange={(e) => setForm({ ...form, station: e.target.value })}
              />
            </div>
          </div>

          {estimatedConsumption != null && (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              Consumo desde o último abastecimento:{" "}
              <span className="font-semibold">
                {estimatedConsumption.toFixed(1)} km/l
              </span>
              {previousKm != null && (
                <span className="text-muted-foreground">
                  {" "}
                  ({(form.km - previousKm).toLocaleString("pt-BR")} km /{" "}
                  {form.liters.toFixed(1)} L)
                </span>
              )}
            </p>
          )}

          {isEditing && fuelLog?.transaction_id != null && (
            <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Este abastecimento tem despesa em Finanças — ao salvar, o
              lançamento também será atualizado.
            </p>
          )}

          {!isEditing && dimensions.length > 0 && (
            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={registerExpense}
                  onChange={(e) => setRegisterExpense(e.target.checked)}
                  className="rounded"
                />
                Registrar como despesa em Finanças
              </label>
              {registerExpense && (
                <ExpenseCategoryPicker
                  dimensions={dimensions}
                  selectedType={selectedType}
                  classId={classId}
                  onTypeChange={setSelectedType}
                  onClassChange={setClassId}
                />
              )}
            </div>
          )}

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
