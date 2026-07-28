import type { User } from "@supabase/supabase-js";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { deleteTripExpense } from "@/api/travel";
import { EXPENSE_CATEGORY_LABELS } from "@/domain/travel";
import { formatBRL, formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { TripExpense, TripFull } from "@/types/travel";

type TripExpensesTabProps = {
  trip: TripFull;
  hasBudget: boolean;
  user: User | null;
  onCreate: () => void;
  onEdit: (exp: TripExpense) => void;
  onRegisterSplit: (exp: TripExpense) => void;
  onReload: () => void;
};

export function TripExpensesTab({
  trip,
  hasBudget,
  user,
  onCreate,
  onEdit,
  onRegisterSplit,
  onReload,
}: TripExpensesTabProps) {
  return (
    <TabsContent value="expenses" className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Total:{" "}
          <span className="font-semibold text-foreground">
            {formatBRL(trip.expenseTotal)}
          </span>
          {hasBudget && (
            <>
              {" "}
              de{" "}
              <span className="font-semibold text-foreground">
                {formatBRL(trip.budget as number)}
              </span>
            </>
          )}
        </p>
        <Button onClick={onCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Adicionar gasto
        </Button>
      </div>
      {trip.expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum gasto registrado ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {trip.expenses.map((exp) => (
            <li
              key={exp.id}
              className="flex justify-between items-center rounded-lg border p-3 text-sm gap-2"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{exp.description}</p>
                <p className="text-xs text-muted-foreground">
                  {EXPENSE_CATEGORY_LABELS[exp.category]} ·{" "}
                  {formatDateBR(exp.expense_date)}
                  {exp.place_visit_id ? " · Lugar" : ""}
                  {(exp.visibility ?? "personal") === "shared"
                    ? " · Conjunta"
                    : " · Pessoal"}
                </p>
                {(exp.visibility ?? "personal") === "shared" &&
                exp.splits?.length ? (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Sua fatia:{" "}
                    {formatBRL(
                      exp.splits.find((s) => s.user_id === user?.id)
                        ?.amount ?? 0
                    )}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="font-semibold mr-1">
                  {formatBRL(exp.amount)}
                </span>
                {(exp.visibility ?? "personal") === "shared" &&
                user?.id &&
                exp.splits?.some(
                  (s) => s.user_id === user.id && !s.transaction_id
                ) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2"
                    onClick={() => onRegisterSplit(exp)}
                  >
                    Registrar Despesa
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-7 w-7", ICON_EDIT_BUTTON_CLASS)}
                  onClick={() => onEdit(exp)}
                  aria-label="Editar gasto"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <ConfirmDeleteDialog
                  title="Excluir este gasto?"
                  description={
                    exp.transaction_id != null && exp.place_visit_id
                      ? "Também remove o valor do lugar e o lançamento no extrato automaticamente."
                      : exp.transaction_id != null
                        ? "Também remove o lançamento no extrato automaticamente."
                        : exp.place_visit_id
                          ? "Também zera o valor registrado no lugar."
                          : undefined
                  }
                  onConfirm={() =>
                    deleteTripExpense(exp.id, trip.id).then(onReload)
                  }
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </ConfirmDeleteDialog>
              </div>
            </li>
          ))}
        </ul>
      )}
    </TabsContent>
  );
}
