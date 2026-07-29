import type { Dimension } from "@/types/dimensions";
import type { RecurringCreateRequest } from "@/types/recurring";
import { useEffect, useMemo, useState } from "react";
import {
  getTotalFromInstallments,
  splitInstallmentValue,
} from "@/domain/recurring";
import { formatBRL } from "@/lib/currency";
import { cn, sortByNamePt } from "@/lib/utils";
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
import { MoneyInput } from "@/components/MoneyInput";
import { FormLabel } from "@/components/FormLabel";

interface RecurringFormDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  newRecurring: RecurringCreateRequest;
  setNewRecurring: (recurring: RecurringCreateRequest) => void;
  createRecurring: (recurring?: RecurringCreateRequest) => void;
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
  const [totalValue, setTotalValue] = useState<number | "">("");

  const hasInstallments =
    !!newRecurring.installment_count && newRecurring.installment_count > 0;

  const installmentValue =
    hasInstallments &&
    typeof totalValue === "number" &&
    totalValue > 0 &&
    newRecurring.installment_count
      ? splitInstallmentValue(totalValue, newRecurring.installment_count)
      : null;

  useEffect(() => {
    if (!open) return;

    if (hasInstallments && newRecurring.value > 0 && newRecurring.installment_count) {
      setTotalValue(
        getTotalFromInstallments(
          newRecurring.value,
          newRecurring.installment_count
        )
      );
    } else if (!hasInstallments) {
      setTotalValue("");
    }
  }, [open, hasInstallments, newRecurring.value, newRecurring.installment_count]);

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

  const naturesSorted = useMemo(() => sortByNamePt(dimensions), [dimensions]);
  const selectedNatureObj = dimensions.find((n) => n.id === selectedNature);
  const types = useMemo(
    () => sortByNamePt(selectedNatureObj?.types ?? []),
    [selectedNatureObj]
  );
  const selectedTypeObj = types.find((t) => t.id === selectedType);
  const classes = useMemo(
    () => sortByNamePt(selectedTypeObj?.classes ?? []),
    [selectedTypeObj]
  );

  const handleCreate = () => {
    if (!selectedNature) return setFormError("Selecione a Natureza.");
    if (!selectedType) return setFormError("Selecione o Tipo.");
    if (!newRecurring.class_id) return setFormError("Selecione a Classe.");
    if (!newRecurring.description.trim())
      return setFormError("Informe a Descrição.");
    if (!newRecurring.frequency) return setFormError("Selecione a Frequência.");

    if (hasInstallments) {
      if (!newRecurring.installment_count || newRecurring.installment_count < 1) {
        return setFormError("Informe o número de parcelas.");
      }
      if (typeof totalValue !== "number" || totalValue <= 0) {
        return setFormError("Informe o valor total.");
      }
    } else if (!newRecurring.value || newRecurring.value <= 0) {
      return setFormError("Informe um Valor válido.");
    }

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

    const payload =
      hasInstallments && typeof totalValue === "number"
        ? {
            ...newRecurring,
            value: splitInstallmentValue(
              totalValue,
              newRecurring.installment_count!
            ),
          }
        : newRecurring;

    setNewRecurring(payload);
    createRecurring(payload);
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
          setTotalValue("");
          onClose();
        }
      }}
    >
      {!isEditing && (
        <DialogTrigger asChild>
          <Button className="w-full sm:w-auto">Adicionar recorrência</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] max-w-md gap-0 overflow-y-auto p-4 sm:max-w-xl sm:p-6">
        <DialogHeader className="pb-3">
          <DialogTitle>
            {isEditing ? "Editar recorrência" : "Nova recorrência"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="space-y-1.5">
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
                <SelectValue placeholder="Natureza" />
              </SelectTrigger>
              <SelectContent>
                {naturesSorted.map((nature) => (
                  <SelectItem key={nature.id} value={String(nature.id)}>
                    {nature.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedNature ? (
            <div
              className={cn(
                "grid gap-3",
                selectedType ? "grid-cols-2" : "grid-cols-1"
              )}
            >
              <div className="space-y-1.5">
                <FormLabel required>Tipo</FormLabel>
                <Select
                  value={String(selectedType)}
                  onValueChange={(value) => {
                    setSelectedType(parseInt(value));
                    setNewRecurring({ ...newRecurring, class_id: 0 });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((type) => (
                      <SelectItem key={type.id} value={String(type.id)}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedType ? (
                <div className="space-y-1.5">
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
                      <SelectValue placeholder="Classe" />
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
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
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
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <FormLabel required>
                {hasInstallments ? "Valor total" : "Valor"}
              </FormLabel>
              {hasInstallments ? (
                <MoneyInput
                  placeholder="0,00"
                  value={totalValue}
                  onChange={(value) => setTotalValue(value === "" ? "" : value)}
                />
              ) : (
                <MoneyInput
                  placeholder="0,00"
                  value={newRecurring.value || ""}
                  onChange={(value) =>
                    setNewRecurring({
                      ...newRecurring,
                      value: value === "" ? 0 : value,
                    })
                  }
                />
              )}
            </div>

            <div className="space-y-1.5">
              <FormLabel optional>Parcelas</FormLabel>
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

            <div className="space-y-1.5">
              <FormLabel required>Frequência</FormLabel>
              <Select
                onValueChange={(value: string) =>
                  setNewRecurring({ ...newRecurring, frequency: value })
                }
                value={newRecurring.frequency}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Frequência" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Anual">Anual</SelectItem>
                  <SelectItem value="Mensal">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {installmentValue != null && newRecurring.installment_count ? (
            <p className="-mt-1 text-sm text-muted-foreground">
              {newRecurring.installment_count}x de{" "}
              <span className="font-medium text-foreground">
                {formatBRL(installmentValue)}
              </span>
            </p>
          ) : null}

          {hasInstallments ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FormLabel required>Início do pagamento</FormLabel>
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

              <div className="space-y-1.5">
                <FormLabel required>Dia de vencimento</FormLabel>
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
          ) : null}

          {formError ? (
            <p className="text-sm text-destructive">{formError}</p>
          ) : null}

          <Button onClick={handleCreate} className="w-full sm:w-auto sm:justify-self-start">
            {isEditing ? "Salvar alterações" : "Adicionar recorrência"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
