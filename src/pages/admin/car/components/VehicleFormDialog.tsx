import { useState } from "react";
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
import type {
  FuelType,
  Vehicle,
  VehicleCreateRequest,
  VehicleKind,
} from "@/types/car";
import {
  FUEL_TYPE_LABELS,
  VEHICLE_KIND_LABELS,
  getFuelTypesForKind,
  normalizeVehicleKind,
} from "@/domain/car";
import { createVehicle, updateVehicle } from "@/api/car";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

const emptyVehicle = (): VehicleCreateRequest => ({
  kind: "car",
  brand: "",
  model: "",
  year: null,
  plate: "",
  color: "",
  current_km: 0,
  fuel_type: null,
  purchase_date: null,
  purchase_value: null,
  notes: "",
});

function toForm(vehicle: Vehicle): VehicleCreateRequest {
  return {
    kind: normalizeVehicleKind(vehicle.kind),
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    plate: vehicle.plate,
    color: vehicle.color,
    current_km: vehicle.current_km,
    fuel_type: vehicle.fuel_type,
    purchase_date: vehicle.purchase_date,
    purchase_value: vehicle.purchase_value,
    notes: vehicle.notes,
  };
}

interface VehicleFormDialogProps {
  vehicle?: Vehicle | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
  trigger?: React.ReactNode;
}

export function VehicleFormDialog({
  vehicle,
  open: controlledOpen,
  onOpenChange,
  onSaved,
  trigger,
}: VehicleFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [form, setForm] = useState<VehicleCreateRequest>(
    vehicle ? toForm(vehicle) : emptyVehicle()
  );
  const [showPurchase, setShowPurchase] = useState(
    !!(vehicle?.purchase_date || vehicle?.purchase_value)
  );
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isEditing = !!vehicle;

  function handleOpenChange(value: boolean) {
    setOpen(value);
    if (value && vehicle) {
      setForm(toForm(vehicle));
      setShowPurchase(!!(vehicle.purchase_date || vehicle.purchase_value));
    }
    if (value && !vehicle) {
      setForm(emptyVehicle());
      setShowPurchase(false);
    }
    if (!value) setFormError("");
  }

  async function handleSave() {
    if (!form.brand.trim()) return setFormError("Informe a marca.");
    if (!form.model.trim()) return setFormError("Informe o modelo.");
    if (form.current_km < 0) return setFormError("Km inválido.");

    setFormError("");
    setLoading(true);

    try {
      const payload = {
        ...form,
        kind: normalizeVehicleKind(form.kind),
      };
      if (isEditing && vehicle) {
        await updateVehicle({ id: vehicle.id, ...payload });
      } else {
        await createVehicle(payload);
      }

      toast({
        title: "Sucesso",
        description: isEditing
          ? "Veículo atualizado!"
          : "Veículo cadastrado!",
        duration: 2000,
      });

      setOpen(false);
      if (!isEditing) setForm(emptyVehicle());
      onSaved();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Falha ao salvar veículo."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const fuelOptions = getFuelTypesForKind(normalizeVehicleKind(form.kind));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {!trigger && !isEditing && controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button>Cadastrar veículo</Button>
        </DialogTrigger>
      )}
      <FormDialogShell
        title={isEditing ? "Editar veículo" : "Cadastrar veículo"}
        errorSummary={formError || undefined}
        footer={
          <FormFooter
            onCancel={() => setOpen(false)}
            onSubmit={handleSave}
            submitLabel={
              isEditing ? "Salvar alterações" : "Cadastrar veículo"
            }
            loading={loading}
          />
        }
      >
        <FormSection title="Identificação">
          <FormField label="Tipo" required>
            <Select
              value={normalizeVehicleKind(form.kind)}
              onValueChange={(v) => {
                const kind = v as VehicleKind;
                const allowed = getFuelTypesForKind(kind);
                setForm({
                  ...form,
                  kind,
                  fuel_type:
                    form.fuel_type && allowed.includes(form.fuel_type)
                      ? form.fuel_type
                      : null,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(VEHICLE_KIND_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Marca" required>
            <Input
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
          </FormField>
          <FormField label="Modelo" required>
            <Input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          </FormField>
          <FormFieldRow>
            <FormField label="Ano" optional>
              <Input
                type="number"
                value={form.year ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    year: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </FormField>
            <FormField label="Placa" optional>
              <Input
                value={form.plate ?? ""}
                onChange={(e) => setForm({ ...form, plate: e.target.value })}
              />
            </FormField>
          </FormFieldRow>
          <FormField label="Cor" optional>
            <Input
              value={form.color ?? ""}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </FormField>
        </FormSection>

        <FormSection title="Uso">
          <FormField label="Km atual" required>
            <Input
              type="number"
              value={form.current_km}
              onChange={(e) =>
                setForm({
                  ...form,
                  current_km: Number(e.target.value) || 0,
                })
              }
            />
          </FormField>
          <FormField label="Combustível" optional>
            <Select
              value={form.fuel_type ?? ""}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  fuel_type: (v || null) as FuelType | null,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {fuelOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {FUEL_TYPE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </FormSection>

        <FormDisclosure
          title="Dados de compra"
          description="Data e valor de aquisição do veículo."
          open={showPurchase}
          onOpenChange={setShowPurchase}
        >
          <FormFieldRow>
            <FormField label="Data de compra" optional>
              <DatePicker
                clearable
                date={
                  form.purchase_date
                    ? new Date(`${form.purchase_date}T12:00:00`)
                    : undefined
                }
                onSelect={(d) =>
                  setForm({
                    ...form,
                    purchase_date: d ? formatLocalIsoDate(d) : null,
                  })
                }
              />
            </FormField>
            <FormField label="Valor de compra (R$)" optional>
              <MoneyInput
                value={form.purchase_value ?? ""}
                onChange={(value) =>
                  setForm({
                    ...form,
                    purchase_value: value === "" ? null : value,
                  })
                }
              />
            </FormField>
          </FormFieldRow>
        </FormDisclosure>
      </FormDialogShell>
    </Dialog>
  );
}
