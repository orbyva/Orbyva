import {
  Dialog,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/MoneyInput";
import { TransactionCreateRequest } from "@/types/finance";
import { useEffect, useMemo, useState } from "react";
import { Dimension } from "@/types/finance";
import { DatePicker } from "@/components/DatePicker";
import { FormField, FormFieldRow } from "@/components/FormField";
import {
  FormDialogShell,
  FormFooter,
} from "@/components/FormDialogShell";
import { FormSection } from "@/components/FormSection";
import { Separator } from "@/components/ui/separator";
import { ClassSearchPicker } from "@/components/ClassSearchPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isTravelExpenseClass } from "@/domain/finance/travelLink";
import { fetchTrips } from "@/api/travel";
import type { Trip } from "@/types/travel";

interface TransactionFormDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  newTransaction: TransactionCreateRequest;
  setNewTransaction: (transaction: TransactionCreateRequest) => void;
  createTransaction: (linkedTripId?: string | null) => void;
  dimensions: Dimension[];
  isEditing: boolean;
  onClose: () => void;
  preferredNatureName?: string | null;
  hideTrigger?: boolean;
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
  preferredNatureName = null,
  hideTrigger = false,
}: TransactionFormDialogProps) {
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [trips, setTrips] = useState<Trip[]>([]);
  const [linkedTripId, setLinkedTripId] = useState<string | null>(null);

  const showTripLink = useMemo(
    () =>
      !isEditing &&
      isTravelExpenseClass(
        dimensions as never,
        newTransaction.class_id || null
      ),
    [dimensions, isEditing, newTransaction.class_id]
  );

  useEffect(() => {
    if (!open || !showTripLink) return;
    let cancelled = false;
    void fetchTrips()
      .then((rows) => {
        if (!cancelled) setTrips(rows);
      })
      .catch(() => {
        if (!cancelled) setTrips([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, showTripLink]);

  useEffect(() => {
    if (!showTripLink) setLinkedTripId(null);
  }, [showTripLink]);

  function close() {
    setFormError("");
    setFieldErrors({});
    setLinkedTripId(null);
    setOpen(false);
    onClose();
  }

  const handleSubmit = () => {
    const next: Record<string, string> = {};
    if (!newTransaction.class_id) {
      next.class_id = "Selecione a categoria.";
    }
    if (!newTransaction.value || newTransaction.value <= 0) {
      next.value = "Informe um valor válido.";
    }
    if (!newTransaction.description.trim()) {
      next.description = "Informe a descrição.";
    }
    if (
      !newTransaction.transaction_at ||
      isNaN(new Date(newTransaction.transaction_at).getTime())
    ) {
      next.transaction_at = "Selecione uma data válida.";
    }
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      setFormError("Revise os campos destacados para salvar.");
      return;
    }
    setFieldErrors({});
    setFormError("");
    createTransaction(showTripLink ? linkedTripId : null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(openVal) => {
        if (!openVal) close();
        else setOpen(true);
      }}
    >
      {!isEditing && !hideTrigger && (
        <DialogTrigger asChild>
          <Button className="w-full sm:w-auto">Adicionar transação</Button>
        </DialogTrigger>
      )}
      <FormDialogShell
        title={isEditing ? "Editar transação" : "Nova transação"}
        description="Registre um gasto ou receita. Classifique primeiro, o resto fica mais rápido."
        errorSummary={formError || undefined}
        footer={
          <FormFooter
            onCancel={close}
            onSubmit={handleSubmit}
            submitLabel={
              isEditing ? "Salvar alterações" : "Adicionar transação"
            }
          />
        }
      >
        <FormSection
          title="Classificação"
          subtitle="Natureza e subcategoria definem relatórios e orçamento."
        >
          <FormField
            label="Categoria"
            required
            error={fieldErrors.class_id}
            hint="Busque por nome ou caminho completo."
          >
            <ClassSearchPicker
              dimensions={dimensions}
              value={newTransaction.class_id || null}
              preferredNatureName={isEditing ? null : preferredNatureName}
              hideLabel
              onChange={(opt) =>
                setNewTransaction({
                  ...newTransaction,
                  class_id: opt?.id ?? 0,
                })
              }
            />
          </FormField>
        </FormSection>

        <Separator />

        <FormSection title="Detalhes">
          <FormFieldRow>
            <FormField label="Valor" required error={fieldErrors.value}>
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
            </FormField>
            <FormField
              label="Data"
              required
              error={fieldErrors.transaction_at}
            >
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
            </FormField>
          </FormFieldRow>

          <FormField
            label="Descrição"
            required
            error={fieldErrors.description}
            hint="Aparece no extrato e na busca global."
          >
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
          </FormField>

          {showTripLink ? (
            <FormField
              label="Vincular à viagem"
              optional
              hint="Opcional, útil para fechar o custo da viagem."
            >
              <Select
                value={linkedTripId ?? "none"}
                onValueChange={(v) =>
                  setLinkedTripId(v === "none" ? null : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha a viagem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não vincular</SelectItem>
                  {trips.map((trip) => (
                    <SelectItem key={trip.id} value={trip.id}>
                      {trip.title}
                      {trip.destination ? ` · ${trip.destination}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : null}
        </FormSection>
      </FormDialogShell>
    </Dialog>
  );
}
