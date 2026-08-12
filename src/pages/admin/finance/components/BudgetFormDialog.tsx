import { useEffect, useState } from "react";

import { Dialog, DialogTrigger } from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/MoneyInput";

import { MonthYearPicker } from "@/components/MonthYearPicker";
import { ClassSearchPicker } from "@/components/ClassSearchPicker";
import { FormField, FormFieldRow } from "@/components/FormField";
import {
  FormDialogShell,
  FormFooter,
} from "@/components/FormDialogShell";
import { FormDisclosure, FormSection } from "@/components/FormSection";
import { Separator } from "@/components/ui/separator";

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
  const [applyAllMonths, setApplyAllMonths] = useState(false);

  const monthValue = newBudget.budget_month || defaultBudgetMonth;
  const selectedYear = yearFromMonth(monthValue);

  useEffect(() => {
    if (!open) return;
    setApplyAllMonths(false);
  }, [open]);

  function clearInternalState() {
    setFormError("");
    setApplyAllMonths(false);
  }

  function close() {
    clearInternalState();
    setOpen(false);
    onClose();
  }

  function handleSubmit() {
    if (!newBudget.type_id || !newBudget.class_id) {
      setFormError("Selecione a categoria.");
      return;
    }

    if (!newBudget.planned_value || newBudget.planned_value <= 0) {
      setFormError("Informe um valor válido.");
      return;
    }

    if (!newBudget.budget_month && !defaultBudgetMonth) {
      setFormError("Selecione o mês/ano.");
      return;
    }

    setFormError("");
    void saveBudget({
      applyAllMonths: !isEditing && applyAllMonths,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(openVal) => {
        if (!openVal) close();
        else setOpen(true);
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

      <FormDialogShell
        title={isEditing ? "Editar orçamento" : "Novo orçamento"}
        description="Defina o valor planejado por categoria. Isso alimenta o dashboard."
        errorSummary={formError || undefined}
        footer={
          <FormFooter
            onCancel={close}
            onSubmit={handleSubmit}
            submitLabel={
              isEditing
                ? "Salvar alterações"
                : applyAllMonths
                  ? `Salvar nos 12 meses de ${selectedYear}`
                  : "Adicionar orçamento"
            }
          />
        }
      >
        <FormSection
          title="Classificação"
          subtitle="Busque categoria ou subcategoria, igual às transações."
        >
          <FormField
            label="Categoria"
            required
            hint="Busque por nome ou caminho completo."
          >
            <ClassSearchPicker
              dimensions={dimensions}
              value={newBudget.class_id}
              hideLabel
              autoFocus={!isEditing}
              onChange={(opt) =>
                setNewBudget({
                  ...newBudget,
                  type_id: opt?.typeId ?? null,
                  class_id: opt?.id ?? null,
                })
              }
            />
          </FormField>
        </FormSection>

        <Separator />

        <FormSection title="Planejamento">
          <FormFieldRow>
            <FormField label="Valor planejado" required>
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
            </FormField>
            <FormField
              label={applyAllMonths ? `Ano ${selectedYear}` : "Mês / Ano"}
              required
            >
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
            </FormField>
          </FormFieldRow>

          {!isEditing ? (
            <FormDisclosure
              title={`Replicar em todos os meses de ${selectedYear}`}
              description="Sobrescreve orçamentos já definidos nessa categoria."
              open={applyAllMonths}
              onOpenChange={setApplyAllMonths}
              variant="toggle"
            >
              <p className="text-xs text-muted-foreground">
                Cria o mesmo valor nos 12 meses deste ano.
              </p>
            </FormDisclosure>
          ) : null}
        </FormSection>
      </FormDialogShell>
    </Dialog>
  );
}
