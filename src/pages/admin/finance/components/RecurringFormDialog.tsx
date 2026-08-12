import type { Dimension } from "@/types/dimensions";
import type { RecurringCreateRequest } from "@/types/recurring";
import { useEffect, useMemo, useState } from "react";
import {
  MAX_SPLIT_INSTALLMENTS,
  buildFixedYearPlan,
  countMonthsThroughYearEnd,
  getTotalFromInstallments,
  isFixedRecurringPlan,
  normalizeFixedFrequency,
  splitInstallmentValue,
} from "@/domain/recurring";
import { formatBRL } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/MoneyInput";
import { FormField, FormFieldRow } from "@/components/FormField";
import {
  FormDialogShell,
  FormFooter,
} from "@/components/FormDialogShell";
import { FormSection } from "@/components/FormSection";
import { ClassSearchPicker } from "@/components/ClassSearchPicker";

type PlanMode = "fixed" | "split";

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

function resolvePlanMode(rec: RecurringCreateRequest): PlanMode {
  if (isFixedRecurringPlan(rec)) return "fixed";
  if (rec.installment_count && rec.installment_count > 0) return "split";
  return "fixed";
}

function withScheduleDefaults(
  rec: RecurringCreateRequest,
  overrides: Partial<RecurringCreateRequest> = {}
): RecurringCreateRequest {
  return {
    ...rec,
    payment_start_date:
      rec.payment_start_date ?? new Date().toISOString().split("T")[0],
    due_day: rec.due_day ?? 10,
    frequency: rec.frequency || "Mensal",
    ...overrides,
  };
}

function applyFixedYearFields(
  rec: RecurringCreateRequest
): RecurringCreateRequest {
  const start =
    rec.payment_start_date ?? new Date().toISOString().split("T")[0];
  const frequency = normalizeFixedFrequency(rec.frequency);
  const plan = buildFixedYearPlan(start, frequency);
  return withScheduleDefaults(rec, {
    payment_start_date: start,
    installment_count: plan.installment_count,
    validity: plan.validity,
    frequency,
  });
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
  const [formError, setFormError] = useState("");
  const [totalValue, setTotalValue] = useState<number | "">("");
  const [planMode, setPlanMode] = useState<PlanMode>("fixed");

  const isSplit = planMode === "split";

  const isAnnualFixed =
    !isSplit && normalizeFixedFrequency(newRecurring.frequency) === "Anual";

  const fixedPreview = useMemo(() => {
    if (isSplit) return null;
    const start =
      newRecurring.payment_start_date ??
      new Date().toISOString().split("T")[0];
    const year = start.slice(0, 4);
    const frequency = normalizeFixedFrequency(newRecurring.frequency);
    if (frequency === "Anual") {
      return { kind: "annual" as const, year };
    }
    return {
      kind: "monthly" as const,
      count: countMonthsThroughYearEnd(start),
      year,
    };
  }, [isSplit, newRecurring.payment_start_date, newRecurring.frequency]);

  const installmentValue =
    isSplit &&
    typeof totalValue === "number" &&
    totalValue > 0 &&
    newRecurring.installment_count &&
    newRecurring.installment_count > 0
      ? splitInstallmentValue(totalValue, newRecurring.installment_count)
      : null;

  useEffect(() => {
    if (!open) return;
    const mode = resolvePlanMode(newRecurring);
    setPlanMode(mode);

    if (
      mode === "split" &&
      newRecurring.value > 0 &&
      newRecurring.installment_count
    ) {
      setTotalValue(
        getTotalFromInstallments(
          newRecurring.value,
          newRecurring.installment_count
        )
      );
    } else {
      setTotalValue("");
    }

    if (mode === "fixed") {
      setNewRecurring(applyFixedYearFields(newRecurring));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync once when dialog opens
  }, [open]);

  const switchToFixed = () => {
    setPlanMode("fixed");
    setTotalValue("");
    setNewRecurring(applyFixedYearFields(newRecurring));
  };

  const switchToSplit = () => {
    setPlanMode("split");
    const nextCount =
      newRecurring.installment_count &&
      !isFixedRecurringPlan(newRecurring) &&
      newRecurring.installment_count <= MAX_SPLIT_INSTALLMENTS
        ? newRecurring.installment_count
        : 12;
    setNewRecurring(
      withScheduleDefaults(newRecurring, {
        installment_count: nextCount,
        validity: null,
        frequency: "Mensal",
      })
    );
  };

  function close() {
    setFormError("");
    setTotalValue("");
    setPlanMode("fixed");
    setOpen(false);
    onClose();
  }

  const handleCreate = () => {
    if (!newRecurring.class_id) return setFormError("Selecione a categoria.");
    if (!newRecurring.description.trim())
      return setFormError("Informe a descrição.");
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

    if (isSplit) {
      if (!newRecurring.installment_count || newRecurring.installment_count < 1) {
        return setFormError("Informe o número de parcelas.");
      }
      if (newRecurring.installment_count > MAX_SPLIT_INSTALLMENTS) {
        return setFormError(
          `Use no máximo ${MAX_SPLIT_INSTALLMENTS} parcelas, ou escolha Mensal fixa.`
        );
      }
      if (typeof totalValue !== "number" || totalValue <= 0) {
        return setFormError("Informe o valor total.");
      }
    } else {
      if (!newRecurring.frequency) return setFormError("Selecione a frequência.");
      if (!newRecurring.value || newRecurring.value <= 0) {
        return setFormError("Informe um valor válido.");
      }
    }

    setFormError("");

    const payload = isSplit
      ? {
          ...newRecurring,
          validity: null,
          frequency: "Mensal",
          installment_count: newRecurring.installment_count!,
          value: splitInstallmentValue(
            totalValue as number,
            newRecurring.installment_count!
          ),
        }
      : applyFixedYearFields(newRecurring);

    setNewRecurring(payload);
    createRecurring(payload);
  };

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
          <Button className="w-full sm:w-auto">Nova recorrência</Button>
        </DialogTrigger>
      )}
      <FormDialogShell
        title={isEditing ? "Editar recorrência" : "Nova recorrência"}
        description={
          isSplit
            ? "Compra parcelada mensal, valor total dividido em N meses."
            : "Conta ou receita fixa, gera cobranças até dezembro do ano da data de início."
        }
        errorSummary={formError || undefined}
        footer={
          <FormFooter
            onCancel={close}
            onSubmit={handleCreate}
            submitLabel={
              isEditing ? "Salvar alterações" : "Salvar recorrência"
            }
          />
        }
      >
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/20 p-1">
          <Button
            type="button"
            size="sm"
            variant={!isSplit ? "default" : "ghost"}
            className="h-9"
            onClick={switchToFixed}
          >
            Mensal fixa
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isSplit ? "default" : "ghost"}
            className="h-9"
            onClick={switchToSplit}
          >
            Parcelada (Nx)
          </Button>
        </div>

        <FormSection title="Classificação">
          <FormField label="Categoria" required>
            <ClassSearchPicker
              dimensions={dimensions}
              value={newRecurring.class_id || null}
              hideLabel
              onChange={(opt) =>
                setNewRecurring({
                  ...newRecurring,
                  class_id: opt?.id ?? 0,
                })
              }
            />
          </FormField>

          <FormField label="Descrição" required>
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
          </FormField>
        </FormSection>

        <FormSection title="Valores">
          <div
            className={cn(
              "grid grid-cols-1 gap-3",
              isSplit ? "sm:grid-cols-2" : "sm:grid-cols-3"
            )}
          >
            <FormField
              label={
                isSplit
                  ? "Valor total"
                  : isAnnualFixed
                    ? "Valor anual"
                    : "Valor mensal"
              }
              required
              hint={
                isSplit
                  ? "Soma de todas as parcelas"
                  : isAnnualFixed
                    ? "Cobrado uma vez no ano"
                    : "Cobrado todo mês"
              }
            >
              {isSplit ? (
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
            </FormField>

            {isSplit ? (
              <FormField label="Nº de parcelas" required>
                <Input
                  type="number"
                  min="1"
                  max={MAX_SPLIT_INSTALLMENTS}
                  placeholder="Ex: 12"
                  value={newRecurring.installment_count ?? ""}
                  onChange={(e) =>
                    setNewRecurring({
                      ...newRecurring,
                      installment_count: e.target.value
                        ? Number(e.target.value)
                        : null,
                      validity: null,
                      frequency: "Mensal",
                    })
                  }
                />
              </FormField>
            ) : (
              <FormField label="Frequência" required className="sm:col-span-2">
                <Select
                  value={normalizeFixedFrequency(newRecurring.frequency)}
                  onValueChange={(value: string) =>
                    setNewRecurring(
                      applyFixedYearFields({
                        ...newRecurring,
                        frequency: value,
                      })
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Frequência" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mensal">Mensal</SelectItem>
                    <SelectItem value="Anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}
          </div>

          {installmentValue != null && newRecurring.installment_count ? (
            <p className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Cada parcela:{" "}
              <span className="font-medium text-foreground">
                {formatBRL(installmentValue)}
              </span>
              {" · "}
              {newRecurring.installment_count}x mensais
            </p>
          ) : null}

          {fixedPreview?.kind === "monthly" ? (
            <p className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Gera{" "}
              <span className="font-medium text-foreground">
                {fixedPreview.count}{" "}
                {fixedPreview.count === 1 ? "mês" : "meses"}
              </span>
              {" · "}
              até dez/{fixedPreview.year}
            </p>
          ) : null}

          {fixedPreview?.kind === "annual" ? (
            <p className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Gera{" "}
              <span className="font-medium text-foreground">1 cobrança</span>
              {" · "}
              em {fixedPreview.year}
            </p>
          ) : null}
        </FormSection>

        <FormSection
          title={
            isSplit
              ? "Quando começa a pagar"
              : isAnnualFixed
                ? "Vencimento anual"
                : "Vencimento"
          }
          subtitle={
            isSplit
              ? undefined
              : "Até dezembro do ano da data de início"
          }
        >
          <FormFieldRow>
            <FormField
              label={isSplit ? "1ª parcela em" : "A partir de"}
              required
            >
              <DatePicker
                date={
                  newRecurring.payment_start_date
                    ? new Date(`${newRecurring.payment_start_date}T12:00:00`)
                    : undefined
                }
                onSelect={(date: Date | undefined) => {
                  const nextStart = date
                    ? date.toISOString().split("T")[0]
                    : null;
                  if (!isSplit && nextStart) {
                    setNewRecurring(
                      applyFixedYearFields({
                        ...newRecurring,
                        payment_start_date: nextStart,
                      })
                    );
                    return;
                  }
                  setNewRecurring({
                    ...newRecurring,
                    payment_start_date: nextStart,
                  });
                }}
              />
            </FormField>

            <FormField label="Dia de vencimento" required>
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
            </FormField>
          </FormFieldRow>
        </FormSection>
      </FormDialogShell>
    </Dialog>
  );
}
