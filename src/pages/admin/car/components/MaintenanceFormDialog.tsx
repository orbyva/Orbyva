import { useEffect, useState } from "react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/MoneyInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { formatLocalIsoDate } from "@/lib/dates";
import { FormField, FormFieldRow } from "@/components/FormField";
import { FormDialogShell, FormFooter } from "@/components/FormDialogShell";
import { FormDisclosure, FormSection } from "@/components/FormSection";
import type { Dimension } from "@/types/dimensions";
import type {
  Maintenance,
  MaintenanceCreateRequest,
  MaintenanceType,
  Vehicle,
} from "@/types/car";
import {
  getMaintenanceDefaultKmInterval,
  getMaintenanceTypesForKind,
  MAINTENANCE_TYPE_LABELS,
  getMaintenanceTypeLabel,
  normalizeVehicleKind,
} from "@/domain/car";
import { createMaintenance, updateMaintenance } from "@/api/car";
import { ExpenseCategoryPicker } from "@/components/ExpenseCategoryPicker";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

function emptyMaintenance(vehicleId: string): MaintenanceCreateRequest {
  const today = new Date().toISOString().split("T")[0];
  return {
    vehicle_id: vehicleId,
    type: "oil",
    custom_type: null,
    service_date: today,
    km_at_service: 0,
    cost: null,
    shop: "",
    next_km: null,
    next_date: null,
    notes: "",
    transaction_id: null,
  };
}

interface MaintenanceFormDialogProps {
  vehicle: Vehicle;
  maintenance?: Maintenance | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
  dimensions: Dimension[];
}

export function MaintenanceFormDialog({
  vehicle,
  maintenance,
  open: controlledOpen,
  onOpenChange,
  onSaved,
  dimensions,
}: MaintenanceFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [form, setForm] = useState<MaintenanceCreateRequest>(
    maintenance
      ? { ...maintenance }
      : emptyMaintenance(vehicle.id)
  );
  const [showNextReview, setShowNextReview] = useState(
    !!(maintenance?.next_km || maintenance?.next_date)
  );
  const [registerExpense, setRegisterExpense] = useState(false);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [classId, setClassId] = useState(0);
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isEditing = !!maintenance;

  useEffect(() => {
    if (open && maintenance) {
      setForm({ ...maintenance });
      setShowNextReview(!!(maintenance.next_km || maintenance.next_date));
    } else if (open && !maintenance) {
      setForm({
        ...emptyMaintenance(vehicle.id),
        km_at_service: vehicle.current_km,
      });
      setShowNextReview(false);
      setRegisterExpense(false);
      setSelectedType(null);
      setClassId(0);
    }
  }, [open, maintenance, vehicle.id, vehicle.current_km]);

  function suggestNextKm(type: MaintenanceType, kmAtService: number) {
    const kind = normalizeVehicleKind(vehicle.kind);
    const interval = getMaintenanceDefaultKmInterval(kind)[type];
    if (!interval) return null;
    return kmAtService + interval;
  }

  function handleTypeChange(type: MaintenanceType) {
    const nextKm = suggestNextKm(type, form.km_at_service);
    setForm({ ...form, type, next_km: nextKm });
  }

  function handleKmChange(km: number) {
    const nextKm = suggestNextKm(form.type, km);
    setForm({
      ...form,
      km_at_service: km,
      next_km: form.next_km == null ? nextKm : form.next_km,
    });
  }

  async function handleSave() {
    if (!form.service_date) return setFormError("Informe a data do serviço.");
    if (form.km_at_service < 0) return setFormError("Km inválido.");
    if (form.type === "other" && !form.custom_type?.trim()) {
      return setFormError("Informe o tipo de manutenção.");
    }
    if (!form.next_km && !form.next_date) {
      return setFormError(
        "Informe a próxima troca por km ou por data para receber alertas."
      );
    }
    if (registerExpense && !isEditing) {
      if (!classId) return setFormError("Selecione a subcategoria da despesa.");
      if (!form.cost || form.cost <= 0) {
        return setFormError("Informe o custo para registrar a despesa.");
      }
    }

    setFormError("");
    setLoading(true);

    try {
      if (isEditing && maintenance) {
        const label = getMaintenanceTypeLabel(form.type, form.custom_type);
        await updateMaintenance(
          { id: maintenance.id, ...form },
          {
            syncTransaction:
              maintenance.transaction_id && form.cost != null && form.cost > 0
                ? {
                    value: form.cost,
                    description: `Manutenção: ${label}`,
                    transaction_at: new Date(
                      `${form.service_date}T12:00:00`
                    ).toISOString(),
                  }
                : null,
          }
        );
      } else {
        const label = getMaintenanceTypeLabel(form.type, form.custom_type);
        const transaction =
          registerExpense && form.cost
            ? {
                class_id: classId,
                value: form.cost,
                description: `Manutenção: ${label}`,
                transaction_at: new Date(
                  `${form.service_date}T12:00:00`
                ).toISOString(),
              }
            : null;

        await createMaintenance(form, transaction);
      }

      toast({
        title: "Sucesso",
        description: isEditing
          ? maintenance?.transaction_id
            ? "Manutenção e despesa atualizadas!"
            : "Manutenção atualizada!"
          : registerExpense
            ? "Manutenção e despesa registradas!"
            : "Manutenção registrada!",
        duration: 2000,
      });

      setOpen(false);
      setRegisterExpense(false);
      setSelectedType(null);
      setClassId(0);
      onSaved();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao salvar manutenção."),
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
          <Button className="w-full sm:w-auto">Registrar manutenção</Button>
        </DialogTrigger>
      )}
      <FormDialogShell
        title={isEditing ? "Editar manutenção" : "Registrar manutenção"}
        errorSummary={formError || undefined}
        footer={
          <FormFooter
            onCancel={() => setOpen(false)}
            onSubmit={handleSave}
            submitLabel={
              isEditing ? "Salvar alterações" : "Registrar manutenção"
            }
            loading={loading}
          />
        }
      >
        <FormSection title="Serviço">
          <FormField label="Tipo" required>
            <Select
              value={form.type}
              onValueChange={(v) => handleTypeChange(v as MaintenanceType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getMaintenanceTypesForKind(
                  normalizeVehicleKind(vehicle.kind)
                ).map((key) => (
                  <SelectItem key={key} value={key}>
                    {MAINTENANCE_TYPE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {form.type === "other" && (
            <FormField label="Descrição do serviço" required>
              <Input
                value={form.custom_type ?? ""}
                onChange={(e) =>
                  setForm({ ...form, custom_type: e.target.value })
                }
              />
            </FormField>
          )}

          <FormFieldRow>
            <FormField label="Data" required>
              <DatePicker
                date={
                  form.service_date
                    ? new Date(`${form.service_date}T12:00:00`)
                    : undefined
                }
                onSelect={(d) =>
                  setForm({
                    ...form,
                    service_date: d
                      ? d.toISOString().split("T")[0]
                      : form.service_date,
                  })
                }
              />
            </FormField>
            <FormField label="Km no serviço" required>
              <Input
                type="number"
                value={form.km_at_service}
                onChange={(e) =>
                  handleKmChange(Number(e.target.value) || 0)
                }
              />
            </FormField>
          </FormFieldRow>

          <FormFieldRow>
            <FormField label="Custo (R$)" optional>
              <MoneyInput
                value={form.cost ?? ""}
                onChange={(value) =>
                  setForm({
                    ...form,
                    cost: value === "" ? null : value,
                  })
                }
              />
            </FormField>
            <FormField label="Oficina" optional>
              <Input
                value={form.shop ?? ""}
                onChange={(e) => setForm({ ...form, shop: e.target.value })}
              />
            </FormField>
          </FormFieldRow>

          <FormField label="Observações" optional>
            <Input
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </FormField>
        </FormSection>

        <FormDisclosure
          title="Próxima revisão"
          description="Preencha pelo menos km ou data para receber alertas de troca."
          open={showNextReview}
          onOpenChange={setShowNextReview}
        >
          <FormFieldRow>
            <FormField label="Próximo km" optional>
              <Input
                type="number"
                value={form.next_km ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    next_km: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </FormField>
            <FormField label="Próxima data" optional>
              <DatePicker
                clearable
                date={
                  form.next_date
                    ? new Date(`${form.next_date}T12:00:00`)
                    : undefined
                }
                onSelect={(d) =>
                  setForm({
                    ...form,
                    next_date: d ? formatLocalIsoDate(d) : null,
                  })
                }
              />
            </FormField>
          </FormFieldRow>
        </FormDisclosure>

        {!isEditing && (
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
              <FormField label="Categoria" required>
                <ExpenseCategoryPicker
                  dimensions={dimensions}
                  selectedType={selectedType}
                  classId={classId}
                  onTypeChange={setSelectedType}
                  onClassChange={setClassId}
                  hideLabel
                />
              </FormField>
            )}
          </div>
        )}
      </FormDialogShell>
    </Dialog>
  );
}
