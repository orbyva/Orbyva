import type { Dimension } from "@/types/dimensions";
import type { RecurringCreateRequest } from "@/types/recurring";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/FormLabel";
import { FormSection } from "@/components/FormSection";
import { Separator } from "@/components/ui/separator";

interface RecurringFormDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  newRecurring: RecurringCreateRequest;
  setNewRecurring: (recurring: RecurringCreateRequest) => void;
  createRecurring: () => void;
  isEditing: boolean;
  onClose: () => void;
  dimensions: Dimension[];
}

export function RecurringFormDialog({
  open,
  setOpen,
  newRecurring,
  setNewRecurring,
  createRecurring,
  isEditing,
  onClose,
  dimensions,
}: RecurringFormDialogProps) {
  const [formError, setFormError] = useState<string>("");
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [selectedNature, setSelectedNature] = useState<number | null>(null);

  const hasInstallments =
    !!newRecurring.installment_count && newRecurring.installment_count > 0;

  useEffect(() => {
    if (isEditing && newRecurring.class_id && dimensions.length > 0) {
      for (const nature of dimensions) {
        for (const type of nature.types) {
          const found = type.classes.find(
            (c) => c.id === newRecurring.class_id
          );
          if (found) {
            setSelectedNature(nature.id);
            setSelectedType(type.id);
            return;
          }
        }
      }
    }
  }, [isEditing, newRecurring.class_id, dimensions]);

  const selectedNatureObj = dimensions.find((n) => n.id === selectedNature);
  const types = selectedNatureObj ? selectedNatureObj.types : [];
  const selectedTypeObj = types.find((t) => t.id === selectedType);
  const classes = selectedTypeObj ? selectedTypeObj.classes : [];

  const handleCreate = () => {
    if (!selectedNature) return setFormError("Selecione a Natureza.");
    if (!selectedType) return setFormError("Selecione o Tipo.");
    if (!newRecurring.class_id) return setFormError("Selecione a Classe.");
    if (!newRecurring.value || newRecurring.value <= 0)
      return setFormError("Informe um Valor válido.");
    if (!newRecurring.description.trim())
      return setFormError("Informe a Descrição.");
    if (!newRecurring.frequency) return setFormError("Selecione a Frequência.");

    if (hasInstallments) {
      if (!newRecurring.payment_start_date) {
        return setFormError("Informe o início do pagamento.");
      }
      if (
        !newRecurring.due_day ||
        newRecurring.due_day < 1 ||
        newRecurring.due_day > 31
      ) {
        return setFormError("Informe o dia de vencimento (1 a 31).");
      }
    }

    setFormError("");
    createRecurring();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(openVal) => {
        setOpen(openVal);
        if (!openVal) {
          setSelectedNature(null);
          setSelectedType(null);
          setFormError("");
          onClose();
        }
      }}
    >
      {!isEditing && (
        <DialogTrigger asChild>
          <Button>Adicionar Recorrência</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto p-4 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Recorrência" : "Nova Recorrência"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <FormSection title="Dados principais">
            <FormLabel required>Natureza</FormLabel>
            <Select
              value={String(selectedNature)}
              onValueChange={(value) => {
                setSelectedNature(parseInt(value));
                setSelectedType(null);
                setNewRecurring({ ...newRecurring, class_id: 0 });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a Natureza" />
              </SelectTrigger>
              <SelectContent>
                {dimensions.map((nature) => (
                  <SelectItem key={nature.id} value={String(nature.id)}>
                    {nature.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedNature && (
              <>
                <FormLabel required>Tipo</FormLabel>
                <Select
                  value={String(selectedType)}
                  onValueChange={(value) => {
                    setSelectedType(parseInt(value));
                    setNewRecurring({ ...newRecurring, class_id: 0 });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((type) => (
                      <SelectItem key={type.id} value={String(type.id)}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {selectedType && (
              <>
                <FormLabel required>Classe</FormLabel>
                <Select
                  value={String(newRecurring.class_id)}
                  onValueChange={(value) =>
                    setNewRecurring({
                      ...newRecurring,
                      class_id: Number(value),
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione a Classe" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            <FormLabel required>Descrição</FormLabel>
            <Input
              type="text"
              placeholder="Ex: Cartão Nubank, Aluguel..."
              value={newRecurring.description}
              onChange={(e) =>
                setNewRecurring({
                  ...newRecurring,
                  description: e.target.value,
                })
              }
            />
          </FormSection>

          <Separator />

          <FormSection title="Valores">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-3">
                <FormLabel required>Valor da parcela</FormLabel>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="0,00"
                  value={newRecurring.value || ""}
                  onChange={(e) =>
                    setNewRecurring({
                      ...newRecurring,
                      value: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="space-y-3">
                <FormLabel optional>Número de parcelas</FormLabel>
                <Input
                  type="number"
                  min="1"
                  placeholder="Ex: 12"
                  value={newRecurring.installment_count ?? ""}
                  onChange={(e) =>
                    setNewRecurring({
                      ...newRecurring,
                      installment_count: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                />
              </div>
            </div>
          </FormSection>

          <Separator />

          <FormSection title="Recorrência">
            <FormLabel required>Frequência</FormLabel>
            <Select
              onValueChange={(value: string) =>
                setNewRecurring({ ...newRecurring, frequency: value })
              }
              value={newRecurring.frequency}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a Frequência" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Anual">Anual</SelectItem>
                <SelectItem value="Mensal">Mensal</SelectItem>
              </SelectContent>
            </Select>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-3">
                <FormLabel optional={!hasInstallments} required={hasInstallments}>
                  Início do pagamento
                </FormLabel>
                <DatePicker
                  date={
                    newRecurring.payment_start_date
                      ? new Date(`${newRecurring.payment_start_date}T12:00:00`)
                      : undefined
                  }
                  onSelect={(date: Date | undefined) =>
                    setNewRecurring({
                      ...newRecurring,
                      payment_start_date: date
                        ? date.toISOString().split("T")[0]
                        : null,
                    })
                  }
                />
              </div>

              <div className="space-y-3">
                <FormLabel optional={!hasInstallments} required={hasInstallments}>
                  Dia de vencimento
                </FormLabel>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Ex: 10"
                  value={newRecurring.due_day ?? ""}
                  onChange={(e) =>
                    setNewRecurring({
                      ...newRecurring,
                      due_day: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
            </div>
          </FormSection>

          {formError && <p className="text-sm text-red-500">{formError}</p>}

          <Button onClick={handleCreate} className="w-full sm:w-auto">
            {isEditing ? "Salvar Alterações" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
