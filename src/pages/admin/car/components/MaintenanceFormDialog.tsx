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
import { DatePicker } from "@/components/DatePicker";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import type { Dimension } from "@/types/dimensions";
import type {
  Maintenance,
  MaintenanceCreateRequest,
  MaintenanceType,
  Vehicle,
} from "@/types/car";
import {
  MAINTENANCE_DEFAULT_KM_INTERVAL,
  MAINTENANCE_TYPE_LABELS,
  getMaintenanceTypeLabel,
} from "@/domain/car";
import { createMaintenance, updateMaintenance } from "@/api/car";
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
  const [registerExpense, setRegisterExpense] = useState(false);
  const [selectedNature, setSelectedNature] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [classId, setClassId] = useState(0);
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isEditing = !!maintenance;

  useEffect(() => {
    if (open && maintenance) {
      setForm({ ...maintenance });
    } else if (open && !maintenance) {
      setForm({
        ...emptyMaintenance(vehicle.id),
        km_at_service: vehicle.current_km,
      });
    }
  }, [open, maintenance, vehicle.id, vehicle.current_km]);

  const expenseNatures = dimensions.filter((n) => n.name === "Despesa");
  const selectedNatureObj = expenseNatures.find((n) => n.id === selectedNature);
  const types = selectedNatureObj?.types ?? [];
  const selectedTypeObj = types.find((t) => t.id === selectedType);
  const classes = selectedTypeObj?.classes ?? [];

  function suggestNextKm(type: MaintenanceType, kmAtService: number) {
    const interval = MAINTENANCE_DEFAULT_KM_INTERVAL[type];
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
      if (!classId) return setFormError("Selecione a categoria da despesa.");
      if (!form.cost || form.cost <= 0) {
        return setFormError("Informe o custo para registrar a despesa.");
      }
    }

    setFormError("");
    setLoading(true);

    try {
      if (isEditing && maintenance) {
        await updateMaintenance({ id: maintenance.id, ...form });
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
          ? "Manutenção atualizada!"
          : "Manutenção registrada!",
        duration: 2000,
      });

      setOpen(false);
      setRegisterExpense(false);
      setSelectedNature(null);
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
          <Button>Registrar manutenção</Button>
        </DialogTrigger>
      )}
      <DialogContent className={`${FORM_DIALOG_CONTENT_CLASS} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar manutenção" : "Registrar manutenção"}
          </DialogTitle>
        </DialogHeader>

        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required>Tipo</FormLabel>
            <Select
              value={form.type}
              onValueChange={(v) => handleTypeChange(v as MaintenanceType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MAINTENANCE_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.type === "other" && (
            <div>
              <FormLabel required>Descrição do serviço</FormLabel>
              <Input
                value={form.custom_type ?? ""}
                onChange={(e) =>
                  setForm({ ...form, custom_type: e.target.value })
                }
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel required>Data</FormLabel>
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
            </div>
            <div>
              <FormLabel required>Km no serviço</FormLabel>
              <Input
                type="number"
                value={form.km_at_service}
                onChange={(e) =>
                  handleKmChange(Number(e.target.value) || 0)
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel optional>Custo (R$)</FormLabel>
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
            <div>
              <FormLabel optional>Oficina</FormLabel>
              <Input
                value={form.shop ?? ""}
                onChange={(e) => setForm({ ...form, shop: e.target.value })}
              />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <p className="text-sm font-medium">Próxima troca (alertas)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel optional>Próximo km</FormLabel>
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
              </div>
              <div>
                <FormLabel optional>Próxima data</FormLabel>
                <DatePicker
                  date={
                    form.next_date
                      ? new Date(`${form.next_date}T12:00:00`)
                      : undefined
                  }
                  onSelect={(d) =>
                    setForm({
                      ...form,
                      next_date: d
                        ? d.toISOString().split("T")[0]
                        : null,
                    })
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Preencha pelo menos um dos dois para receber alertas de troca.
            </p>
          </div>

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
                <div className="space-y-3">
                  <div>
                    <FormLabel required>Natureza</FormLabel>
                    <Select
                      value={selectedNature ? String(selectedNature) : ""}
                      onValueChange={(v) => {
                        setSelectedNature(Number(v));
                        setSelectedType(null);
                        setClassId(0);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Despesa" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseNatures.map((n) => (
                          <SelectItem key={n.id} value={String(n.id)}>
                            {n.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedNature && (
                    <div>
                      <FormLabel required>Tipo</FormLabel>
                      <Select
                        value={selectedType ? String(selectedType) : ""}
                        onValueChange={(v) => {
                          setSelectedType(Number(v));
                          setClassId(0);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {types.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {selectedType && (
                    <div>
                      <FormLabel required>Categoria</FormLabel>
                      <Select
                        value={classId ? String(classId) : ""}
                        onValueChange={(v) => setClassId(Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <FormLabel optional>Observações</FormLabel>
            <Input
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
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
