import { useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/MoneyInput";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { MonthYearPicker } from "@/components/MonthYearPicker";
import { FormLabel, FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
import { Separator } from "@/components/ui/separator";
import { sortByNamePt } from "@/lib/utils";

import type {
  Dimension,
  MonthlyBudgetCreateRequest,
} from "@/types/finance";

export type BudgetSaveOptions = {
  applyAllMonths: boolean;
};

interface BudgetFormDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  newBudget: MonthlyBudgetCreateRequest;
  setNewBudget: (budget: MonthlyBudgetCreateRequest) => void;
  saveBudget: (options?: BudgetSaveOptions) => void | Promise<void>;
  dimensions: Dimension[];
  isEditing: boolean;
  defaultBudgetMonth: string;
  onClose: () => void;
}

function yearFromMonth(iso: string): number {
  const y = Number(iso.slice(0, 4));
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

export function BudgetFormDialog({
  open,
  setOpen,
  newBudget,
  setNewBudget,
  saveBudget,
  dimensions,
  isEditing,
  onClose,
  defaultBudgetMonth,
}: BudgetFormDialogProps) {
  const [formError, setFormError] = useState("");
  const [selectedNature, setSelectedNature] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [applyAllMonths, setApplyAllMonths] = useState(false);

  const monthValue = newBudget.budget_month || defaultBudgetMonth;
  const selectedYear = yearFromMonth(monthValue);

  useEffect(() => {
    if (!open) return;
    setApplyAllMonths(false);
  }, [open]);

  useEffect(() => {
    if (isEditing && newBudget.type_id && dimensions.length > 0) {
      for (const nature of dimensions) {
        const foundType = nature.types.find(
          (type) => type.id === newBudget.type_id
        );

        if (foundType) {
          setSelectedNature(nature.id);
          setSelectedType(foundType.id);
          break;
        }
      }
    }
  }, [isEditing, newBudget.type_id, dimensions]);

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

  function handleSubmit() {
    if (!selectedNature) {
      setFormError("Selecione a Natureza.");
      return;
    }

    if (!selectedType) {
      setFormError("Selecione a categoria.");
      return;
    }

    if (!newBudget.planned_value || newBudget.planned_value <= 0) {
      setFormError("Informe um Valor válido.");
      return;
    }

    if (!newBudget.budget_month && !defaultBudgetMonth) {
      setFormError("Selecione o Mês/Ano.");
      return;
    }

    setFormError("");
    void saveBudget({
      applyAllMonths: !isEditing && applyAllMonths,
    });
  }

  function clearInternalState() {
    setSelectedNature(null);
    setSelectedType(null);
    setFormError("");
    setApplyAllMonths(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(openVal) => {
        setOpen(openVal);

        if (!openVal) {
          clearInternalState();
          onClose();
        }
      }}
    >
      {!isEditing && (
        <DialogTrigger asChild>
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              setNewBudget({
                type_id: null,
                class_id: null,
                budget_month: defaultBudgetMonth,
                planned_value: 0,
              });

              clearInternalState();
            }}
          >
            Adicionar orçamento
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar orçamento" : "Novo orçamento"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
            <FormLabel required>Natureza</FormLabel>

            <Select
              value={selectedNature ? String(selectedNature) : ""}
              onValueChange={(value) => {
                setSelectedNature(Number(value));
                setSelectedType(null);
                setNewBudget({
                  ...newBudget,
                  type_id: null,
                  class_id: null,
                });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a Natureza" />
              </SelectTrigger>

              <SelectContent>
                {naturesSorted.map((nature) => (
                  <SelectItem key={nature.id} value={String(nature.id)}>
                    {nature.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedNature && (
              <div
                className={
                  selectedType
                    ? "grid grid-cols-2 gap-3"
                    : "grid grid-cols-1 gap-3"
                }
              >
                <div className="space-y-3">
                  <FormLabel required>Categoria</FormLabel>

                  <Select
                    value={selectedType ? String(selectedType) : ""}
                    onValueChange={(value) => {
                      const typeId = Number(value);

                      setSelectedType(typeId);

                      setNewBudget({
                        ...newBudget,
                        type_id: typeId,
                        class_id: null,
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione a categoria" />
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
                  <div className="space-y-3">
                    <FormLabel optional>Subcategoria</FormLabel>

                    <Select
                      value={
                        newBudget.class_id
                          ? String(newBudget.class_id)
                          : "general"
                      }
                      onValueChange={(value) => {
                        setNewBudget({
                          ...newBudget,
                          class_id: value === "general" ? null : Number(value),
                        });
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione a subcategoria" />
                      </SelectTrigger>

                      <SelectContent>
                        <SelectItem value="general">Geral da categoria</SelectItem>

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
            )}

          <Separator />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-3">
                <FormLabel required>Valor planejado</FormLabel>
                <MoneyInput
                  placeholder="0,00"
                  value={newBudget.planned_value || ""}
                  onChange={(value) =>
                    setNewBudget({
                      ...newBudget,
                      planned_value: value === "" ? 0 : value,
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <FormLabel required>
                {applyAllMonths ? `Ano ${selectedYear}` : "Mês / Ano"}
              </FormLabel>
              <MonthYearPicker
                value={monthValue}
                allMonthsSelected={applyAllMonths}
                onChange={(value) =>
                  setNewBudget({
                    ...newBudget,
                    budget_month: value,
                  })
                }
              />
              {!isEditing ? (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm transition hover:bg-muted/40">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-primary"
                    checked={applyAllMonths}
                    onChange={(e) => setApplyAllMonths(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">
                      Usar em todos os meses de {selectedYear}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Cria o mesmo valor nos 12 meses deste ano.
                    </span>
                  </span>
                </label>
              ) : null}
            </div>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button onClick={handleSubmit} className="w-full">
            {isEditing
              ? "Salvar alterações"
              : applyAllMonths
                ? `Salvar nos 12 meses de ${selectedYear}`
                : "Adicionar orçamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
