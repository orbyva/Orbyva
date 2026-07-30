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
import { MoneyInput } from "@/components/MoneyInput";
import { TransactionCreateRequest } from "@/types/finance";
import { useState, useEffect, useMemo } from "react";
import { Dimension } from "@/types/finance";
import { DatePicker } from "@/components/DatePicker";
import { FormLabel } from "@/components/FormLabel";
import { FormSection } from "@/components/FormSection";
import { Separator } from "@/components/ui/separator";
import { sortByNamePt } from "@/lib/utils";
import { NoClassesForTypeHint } from "./NoClassesForTypeHint";

interface TransactionFormDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  newTransaction: TransactionCreateRequest;
  setNewTransaction: (transaction: TransactionCreateRequest) => void;
  createTransaction: () => void;
  dimensions: Dimension[];
  isEditing: boolean;
  onClose: () => void;
}

export function TransactionFormDialog({
  open,
  setOpen,
  newTransaction,
  setNewTransaction,
  createTransaction,
  dimensions,
  isEditing,
  onClose,
}: TransactionFormDialogProps) {
  const [formError, setFormError] = useState<string>("");
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [selectedNature, setSelectedNature] = useState<number | null>(null);

  useEffect(() => {
    if (isEditing && newTransaction.class_id && dimensions.length > 0) {
      for (const nature of dimensions) {
        for (const type of nature.types) {
          const found = type.classes.find(
            (c) => c.id == newTransaction.class_id
          );
          if (found) {
            setSelectedNature(nature.id);
            setSelectedType(type.id);
            break;
          }
        }
      }
    }
  }, [isEditing, newTransaction.class_id, dimensions]);

  const naturesSorted = useMemo(() => sortByNamePt(dimensions), [dimensions]);
  const selectedNatureObj = dimensions.find((n) => n.id == selectedNature);
  const types = useMemo(
    () => sortByNamePt(selectedNatureObj?.types ?? []),
    [selectedNatureObj]
  );
  const selectedTypeObj = types.find((t) => t.id == selectedType);
  const classes = useMemo(
    () => sortByNamePt(selectedTypeObj?.classes ?? []),
    [selectedTypeObj]
  );

  const handleSubmit = () => {
    if (!selectedNature) {
      setFormError("Selecione a Natureza.");
      return;
    }
    if (!selectedType) {
      setFormError("Selecione o Tipo.");
      return;
    }
    if (classes.length === 0) {
      setFormError(
        "Este tipo não tem classes. Cadastre uma em Dimensões."
      );
      return;
    }
    if (!newTransaction.class_id) {
      setFormError("Selecione a Classe.");
      return;
    }
    if (!newTransaction.value || newTransaction.value <= 0) {
      setFormError("Informe um Valor válido.");
      return;
    }
    if (!newTransaction.description.trim()) {
      setFormError("Informe a Descrição.");
      return;
    }
    if (
      !newTransaction.transaction_at ||
      isNaN(new Date(newTransaction.transaction_at).getTime())
    ) {
      setFormError("Selecione uma Data válida.");
      return;
    }
    setFormError("");
    createTransaction();
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
          <Button className="w-full sm:w-auto">Adicionar transação</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto p-4 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar transação" : "Nova transação"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <FormSection title="Classificação">
            <FormLabel required>Natureza</FormLabel>
            <Select
              value={String(selectedNature)}
              onValueChange={(value) => {
                setSelectedNature(parseInt(value));
                setSelectedType(null);
                setNewTransaction({ ...newTransaction, class_id: 0 });
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
                  <FormLabel required>Tipo</FormLabel>
                  <Select
                    value={String(selectedType)}
                    onValueChange={(value) => {
                      setSelectedType(parseInt(value));
                      setNewTransaction({ ...newTransaction, class_id: 0 });
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
                </div>

                {selectedType ? (
                  <div className="space-y-3">
                    <FormLabel required>Classe</FormLabel>
                    {classes.length === 0 ? (
                      <NoClassesForTypeHint typeName={selectedTypeObj?.name} />
                    ) : (
                      <Select
                        value={
                          newTransaction.class_id
                            ? String(newTransaction.class_id)
                            : undefined
                        }
                        onValueChange={(value) =>
                          setNewTransaction({
                            ...newTransaction,
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
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </FormSection>

          <Separator />

          <FormSection title="Detalhes">
            <FormLabel required>Valor</FormLabel>
            <MoneyInput
              placeholder="0,00"
              value={newTransaction.value || ""}
              onChange={(value) =>
                setNewTransaction({
                  ...newTransaction,
                  value: value === "" ? 0 : value,
                })
              }
            />

            <FormLabel required>Descrição</FormLabel>
            <Input
              type="text"
              placeholder="Ex: Supermercado, Salário..."
              value={newTransaction.description}
              onChange={(e) =>
                setNewTransaction({
                  ...newTransaction,
                  description: e.target.value,
                })
              }
            />

            <FormLabel required>Data</FormLabel>
            <DatePicker
              date={
                newTransaction.transaction_at &&
                !isNaN(new Date(newTransaction.transaction_at).getTime())
                  ? new Date(newTransaction.transaction_at)
                  : new Date()
              }
              onSelect={(date) =>
                setNewTransaction({
                  ...newTransaction,
                  transaction_at: date
                    ? date.toISOString()
                    : new Date().toISOString(),
                })
              }
            />
          </FormSection>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button onClick={handleSubmit} className="w-full sm:w-auto">
            {isEditing ? "Salvar alterações" : "Adicionar transação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
