"use client";

import { Fragment } from "react";
import { Pen, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { MonthlyBudgetSummary } from "@/types/finance";
import { formatBRL } from "@/lib/currency";
import { statusBadgeStyles, statusProgressStyles } from "@/lib/design-tokens";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { cn } from "@/lib/utils";

interface BudgetTableProps {
  budgets: MonthlyBudgetSummary[];
  isMobile?: boolean;
  loading?: boolean;
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  selectedBudget: MonthlyBudgetSummary | null;
  setSelectedBudget: (budget: MonthlyBudgetSummary | null) => void;
  deleteBudget: () => void;
  deleteLoading: string | null;
  handleEdit: (budget: MonthlyBudgetSummary) => void;
}

function getRealizedValue(budget?: MonthlyBudgetSummary | null) {
  if (!budget) return 0;

  return budget.nature_name === "Receita"
    ? Number(budget.income_value || 0)
    : Number(budget.expense_value ?? budget.spent_value ?? 0);
}

function getRealizedLabel(budget?: MonthlyBudgetSummary | null) {
  return budget?.nature_name === "Receita" ? "Recebido" : "Gasto";
}

function getRemainingLabel(budget?: MonthlyBudgetSummary | null) {
  return budget?.nature_name === "Receita" ? "A receber" : "Restante";
}

function getRemainingClass(budget?: MonthlyBudgetSummary | null) {
  if (!budget) return "text-muted-foreground";

  const remaining = Number(budget.remaining_value || 0);
  const planned = Number(budget.planned_value || 0);

  if (budget.nature_name === "Receita") {
    if (remaining <= 0) return "text-success";
    if (planned > 0 && remaining <= planned * 0.3) return "text-warning";
    return "text-destructive";
  }

  if (remaining < 0) return "text-destructive";
  if (planned > 0 && remaining <= planned * 0.3) return "text-warning";
  return "text-success";
}

function getStatusFromPercentage(value: number, natureName?: string) {
  if (natureName === "Receita") {
    if (value >= 100) return "OK";
    if (value >= 70) return "QUASE";
    return "ATENCAO";
  }

  if (value > 100) return "ESTOUROU";
  if (value >= 90) return "CRITICO";
  if (value >= 70) return "ATENCAO";
  return "OK";
}

function createGroupSummary(
  typeName: string,
  items: MonthlyBudgetSummary[]
): MonthlyBudgetSummary {
  const first = items[0];

  const planned = items.reduce(
    (sum, item) => sum + Number(item.planned_value || 0),
    0
  );

  const realized = items.reduce(
    (sum, item) => sum + getRealizedValue(item),
    0
  );

  const remaining =
    first?.nature_name === "Receita" ? planned - realized : planned - realized;

  const percentage = planned > 0 ? (realized / planned) * 100 : 0;

  return {
    ...first,
    id: first?.id ?? typeName,
    type_name: typeName,
    class_id: null,
    class_name: null,
    planned_value: planned,
    income_value: first?.nature_name === "Receita" ? realized : 0,
    expense_value: first?.nature_name === "Receita" ? 0 : realized,
    spent_value: first?.nature_name === "Receita" ? 0 : realized,
    remaining_value: remaining,
    percentage_used: percentage,
    status: getStatusFromPercentage(percentage, first?.nature_name),
  } as MonthlyBudgetSummary;
}

function ProgressBar({ value, status }: { value: number; status: string }) {
  const normalized = Math.min(Math.max(Number(value || 0), 0), 100);

  const colorMap: Record<string, string> = statusProgressStyles;

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all ${
          colorMap[status] ?? "bg-primary"
        }`}
        style={{ width: `${normalized}%` }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusBadgeStyles[status] ?? "bg-muted text-muted-foreground"
      )}
    >
      {status}
    </span>
  );
}

function BudgetActions({
  budget,
  confirmOpen,
  setConfirmOpen,
  selectedBudget,
  setSelectedBudget,
  deleteBudget,
  deleteLoading,
  handleEdit,
}: {
  budget: MonthlyBudgetSummary;
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  selectedBudget: MonthlyBudgetSummary | null;
  setSelectedBudget: (budget: MonthlyBudgetSummary | null) => void;
  deleteBudget: () => void;
  deleteLoading: string | null;
  handleEdit: (budget: MonthlyBudgetSummary) => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-10 w-10", ICON_EDIT_BUTTON_CLASS)}
        onClick={() => handleEdit(budget)}
      >
        <Pen className="h-4 w-4" />
      </Button>

      <AlertDialog
        open={confirmOpen && selectedBudget?.id === budget.id}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setSelectedBudget(null);
        }}
      >
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={() => {
              setSelectedBudget(budget);
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Deseja remover este orçamento?
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmOpen(false);
                setSelectedBudget(null);
              }}
            >
              Cancelar
            </AlertDialogCancel>

            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                deleteBudget();
              }}
              disabled={deleteLoading === String(budget.id)}
            >
              {deleteLoading === String(budget.id) ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BudgetValueCell({
  value,
  label,
  className = "",
}: {
  budget: MonthlyBudgetSummary;
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col ${className}`}>
      <span>{formatBRL(value)}</span>
      <span className="text-xs font-normal text-muted-foreground">{label}</span>
    </div>
  );
}

export function BudgetTable({
  budgets,
  isMobile = false,
  loading = false,
  confirmOpen,
  setConfirmOpen,
  selectedBudget,
  setSelectedBudget,
  deleteBudget,
  deleteLoading,
  handleEdit,
}: BudgetTableProps) {
  const groupedBudgets = budgets.reduce<Record<string, MonthlyBudgetSummary[]>>(
    (acc, budget) => {
      const key = budget.type_name ?? "Sem tipo";
      if (!acc[key]) acc[key] = [];
      acc[key].push(budget);
      return acc;
    },
    {}
  );

  const orderedGroups = Object.entries(groupedBudgets).sort(
    ([typeA], [typeB]) => {
      const order = ["Receita", "Despesa", "Despesas"];
      const indexA = order.indexOf(typeA);
      const indexB = order.indexOf(typeB);

      if (indexA === -1 && indexB === -1) return typeA.localeCompare(typeB);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;

      return indexA - indexB;
    }
  );

  if (isMobile) {
    if (loading) {
      return (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Carregando orçamento...
        </div>
      );
    }

    if (!budgets.length) {
      return (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Nenhum orçamento encontrado para este mês.
        </div>
      );
    }

    return (
      <div className="divide-y divide-border/60">
        {orderedGroups.map(([typeName, items]) => {
          const parent =
            items.find((budget) => budget.class_id === null) ??
            createGroupSummary(typeName, items);
          const children = items.filter((budget) => budget.class_id !== null);

          return (
            <div key={typeName} className="space-y-2 p-4">
              <div className="space-y-2 rounded-xl bg-muted/50 p-3 ring-1 ring-border/40">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Tipo
                    </p>
                    <p className="font-bold tracking-tight">{typeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {children.length}{" "}
                      {children.length === 1 ? "classe" : "classes"}
                    </p>
                  </div>
                  <StatusBadge status={parent.status ?? "OK"} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Orçado</p>
                    <p className="font-semibold tabular-nums">
                      {formatBRL(parent.planned_value)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {getRealizedLabel(parent)}
                    </p>
                    <p className="font-medium tabular-nums">
                      {formatBRL(getRealizedValue(parent))}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {getRemainingLabel(parent)}
                    </p>
                    <p
                      className={cn(
                        "font-semibold tabular-nums",
                        getRemainingClass(parent)
                      )}
                    >
                      {formatBRL(Number(parent.remaining_value || 0))}
                    </p>
                  </div>
                </div>

                {items.some((budget) => budget.class_id === null) && (
                  <BudgetActions
                    budget={parent}
                    confirmOpen={confirmOpen}
                    setConfirmOpen={setConfirmOpen}
                    selectedBudget={selectedBudget}
                    setSelectedBudget={setSelectedBudget}
                    deleteBudget={deleteBudget}
                    deleteLoading={deleteLoading}
                    handleEdit={handleEdit}
                  />
                )}
              </div>

              {children.map((budget) => (
                <div
                  key={budget.id}
                  className="ml-1 space-y-2 rounded-lg border border-l-2 border-border/50 border-l-primary/30 bg-card/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Classe · {typeName}
                      </p>
                      <p className="font-medium">
                        {budget.class_name ?? "Sem classe"}
                      </p>
                    </div>
                    <StatusBadge status={budget.status} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Orçado</p>
                      <p className="font-medium tabular-nums">
                        {formatBRL(budget.planned_value)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {getRealizedLabel(budget)}
                      </p>
                      <p className="font-medium tabular-nums">
                        {formatBRL(getRealizedValue(budget))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {getRemainingLabel(budget)}
                      </p>
                      <p
                        className={cn(
                          "font-semibold tabular-nums",
                          getRemainingClass(budget)
                        )}
                      >
                        {formatBRL(Number(budget.remaining_value || 0))}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {Number(budget.percentage_used || 0).toFixed(0)}%
                      </span>
                    </div>
                    <ProgressBar
                      value={Number(budget.percentage_used || 0)}
                      status={budget.status}
                    />
                  </div>

                  <BudgetActions
                    budget={budget}
                    confirmOpen={confirmOpen}
                    setConfirmOpen={setConfirmOpen}
                    selectedBudget={selectedBudget}
                    setSelectedBudget={setSelectedBudget}
                    deleteBudget={deleteBudget}
                    deleteLoading={deleteLoading}
                    handleEdit={handleEdit}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[240px]">Tipo / Classe</TableHead>
              <TableHead className="text-right">Orçado</TableHead>
              <TableHead className="text-right">Realizado</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="min-w-[180px]">Uso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  Carregando orçamento...
                </TableCell>
              </TableRow>
            ) : budgets.length ? (
              orderedGroups.map(([typeName, items]) => {
                const parent =
                  items.find((budget) => budget.class_id === null) ??
                  createGroupSummary(typeName, items);

                const children = items.filter(
                  (budget) => budget.class_id !== null
                );

                return (
                  <Fragment key={typeName}>
                    <TableRow className="border-b-0 bg-muted/50 hover:bg-muted/50">
                      <TableCell className="py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Tipo
                          </span>
                          <span className="text-sm font-bold tracking-tight">
                            {typeName}
                          </span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {children.length}{" "}
                            {children.length === 1 ? "classe" : "classes"}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="py-3 text-right text-sm font-semibold tabular-nums">
                        {formatBRL(parent.planned_value)}
                      </TableCell>

                      <TableCell className="py-3 text-right text-sm tabular-nums text-muted-foreground">
                        {formatBRL(getRealizedValue(parent))}
                      </TableCell>

                      <TableCell
                        className={cn(
                          "py-3 text-right text-sm font-semibold tabular-nums",
                          getRemainingClass(parent)
                        )}
                      >
                        {formatBRL(Number(parent.remaining_value || 0))}
                      </TableCell>

                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium tabular-nums">
                            {Number(parent.percentage_used || 0).toFixed(0)}%
                          </span>
                          <div className="h-1.5 min-w-[72px] flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                statusProgressStyles[parent.status ?? "OK"] ??
                                  "bg-muted-foreground"
                              )}
                              style={{
                                width: `${Math.min(
                                  Number(parent.percentage_used || 0),
                                  100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-3">
                        <StatusBadge status={parent.status ?? "OK"} />
                      </TableCell>

                      <TableCell className="py-3">
                        {items.some((budget) => budget.class_id === null) && (
                          <BudgetActions
                            budget={parent}
                            confirmOpen={confirmOpen}
                            setConfirmOpen={setConfirmOpen}
                            selectedBudget={selectedBudget}
                            setSelectedBudget={setSelectedBudget}
                            deleteBudget={deleteBudget}
                            deleteLoading={deleteLoading}
                            handleEdit={handleEdit}
                          />
                        )}
                      </TableCell>
                    </TableRow>

                    {children.map((budget) => (
                      <TableRow
                        key={budget.id}
                        className="border-l-2 border-l-primary/25 transition-colors odd:bg-background hover:bg-muted/30"
                      >
                        <TableCell className="py-3.5">
                          <div className="flex items-start gap-3 pl-4">
                            <div className="mt-1 h-5 w-0.5 shrink-0 rounded-full bg-primary/40" />
                            <div className="min-w-0">
                              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Classe · {typeName}
                              </span>
                              <p className="font-medium leading-snug">
                                {budget.class_name ?? "Sem classe"}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="text-right font-medium">
                          {formatBRL(budget.planned_value)}
                        </TableCell>

                        <TableCell className="text-right">
                          <BudgetValueCell
                            budget={budget}
                            value={getRealizedValue(budget)}
                            label={getRealizedLabel(budget)}
                          />
                        </TableCell>

                        <TableCell
                          className={`text-right font-semibold ${getRemainingClass(
                            budget
                          )}`}
                        >
                          <BudgetValueCell
                            budget={budget}
                            value={Number(budget.remaining_value || 0)}
                            label={getRemainingLabel(budget)}
                          />
                        </TableCell>

                        <TableCell>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">
                                {Number(budget.percentage_used || 0).toFixed(0)}
                                %
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {budget.nature_name === "Receita"
                                  ? "recebido"
                                  : "usado"}
                              </span>
                            </div>

                            <ProgressBar
                              value={Number(budget.percentage_used || 0)}
                              status={budget.status}
                            />
                          </div>
                        </TableCell>

                        <TableCell>
                          <StatusBadge status={budget.status} />
                        </TableCell>

                        <TableCell>
                          <BudgetActions
                            budget={budget}
                            confirmOpen={confirmOpen}
                            setConfirmOpen={setConfirmOpen}
                            selectedBudget={selectedBudget}
                            setSelectedBudget={setSelectedBudget}
                            deleteBudget={deleteBudget}
                            deleteLoading={deleteLoading}
                            handleEdit={handleEdit}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  Nenhum orçamento encontrado para este mês.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}