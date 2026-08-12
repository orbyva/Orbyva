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
import { TransactionCreateRequest } from "@/types/finance";
import { useEffect, useMemo, useState } from "react";
import { Dimension } from "@/types/finance";
import { DatePicker } from "@/components/DatePicker";
import { FormLabel, FORM_DIALOG_CONTENT_CLASS } from "@/components/FormLabel";
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
  /** Prefill / filter Natureza by name (e.g. "Despesa") when creating. */
  preferredNatureName?: string | null;
  /** Oculta o botão trigger (ex.: Quick Add host). */
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
  const [formError, setFormError] = useState<string>("");
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

  const handleSubmit = () => {
    if (!newTransaction.class_id) {
      setFormError("Selecione a subcategoria.");
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
    createTransaction(showTripLink ? linkedTripId : null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(openVal) => {
        setOpen(openVal);
        if (!openVal) {
          setFormError("");
          setLinkedTripId(null);
          onClose();
        }
      }}
    >
      {!isEditing && !hideTrigger && (
        <DialogTrigger asChild>
          <Button className="w-full sm:w-auto">Adicionar transação</Button>
        </DialogTrigger>
      )}
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar transação" : "Nova transação"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <FormSection title="Classificação">
            <ClassSearchPicker
              dimensions={dimensions}
              value={newTransaction.class_id || null}
              preferredNatureName={isEditing ? null : preferredNatureName}
              onChange={(opt) =>
                setNewTransaction({
                  ...newTransaction,
                  class_id: opt?.id ?? 0,
                })
              }
            />
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

            {showTripLink ? (
              <div>
                <FormLabel optional>Vincular à viagem</FormLabel>
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
              </div>
            ) : null}
          </FormSection>

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button onClick={handleSubmit} className="w-full">
            {isEditing ? "Salvar alterações" : "Adicionar transação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
