"use client";

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

import { MonthYearPicker } from "@/components/MonthYearPicker";
import { FormLabel } from "@/components/FormLabel";
import { FormSection } from "@/components/FormSection";
import { Separator } from "@/components/ui/separator";

import type {
  Dimension,
  MonthlyBudgetCreateRequest,
} from "@/types/finance";

interface BudgetFormDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  newBudget: MonthlyBudgetCreateRequest;
  setNewBudget: (budget: MonthlyBudgetCreateRequest) => void;
  saveBudget: () => void;
  dimensions: Dimension[];
  isEditing: boolean;
  defaultBudgetMonth: string;
  onClose: () => void;
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

  const selectedNatureObj = dimensions.find((n) => n.id === selectedNature);
  const types = selectedNatureObj ? selectedNatureObj.types : [];
  const selectedTypeObj = types.find((t) => t.id === selectedType);
  const classes = selectedTypeObj ? selectedTypeObj.classes : [];

  function handleSubmit() {
    if (!selectedNature) {
      setFormError("Selecione a Natureza.");
      return;
    }

    if (!selectedType) {
      setFormError("Selecione o Tipo.");
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
    saveBudget();
  }

  function clearInternalState() {
    setSelectedNature(null);
    setSelectedType(null);
    setFormError("");
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
            Adicionar Orçamento
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto p-4 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Orçamento" : "Novo Orçamento"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <FormSection title="Classificação">
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
              <FormLabel optional>Classe</FormLabel>

              <Select
                value={newBudget.class_id ? String(newBudget.class_id) : "general"}
                onValueChange={(value) => {
                  setNewBudget({
                    ...newBudget,
                    class_id: value === "general" ? null : Number(value),
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione a Classe" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="general">Geral do Tipo</SelectItem>

                  {classes.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          </FormSection>

          <Separator />

          <FormSection title="Valores e período">
          <FormLabel required>Valor planejado</FormLabel>

          <Input
            type="number"
            min="1"
            step="0.01"
            placeholder="0,00"
            value={newBudget.planned_value || ""}
            onChange={(e) =>
              setNewBudget({
                ...newBudget,
                planned_value: Number(e.target.value),
              })
            }
          />

          <FormLabel required>Mês/Ano</FormLabel>

          <MonthYearPicker
            value={newBudget.budget_month || defaultBudgetMonth}
            onChange={(value) =>
              setNewBudget({
                ...newBudget,
                budget_month: value,
              })
            }
          />
          </FormSection>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button onClick={handleSubmit} className="w-full sm:w-auto">
            {isEditing ? "Salvar Alterações" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
