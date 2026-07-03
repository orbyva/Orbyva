import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchMonthlyBudgetSummary,
  createMonthlyBudgetApi,
  updateMonthlyBudgetApi,
  deleteMonthlyBudgetApi,
  duplicateMonthlyBudgetApi,
  fetchMonthlyBudgetSuggestions,
  fetchDimensions,
} from "@/api/finance";

import { BudgetSummary } from "@/pages/admin/finance/components/BudgetSummary";
import { BudgetAlerts } from "@/pages/admin/finance/components/BudgetAlerts";
import { BudgetTable } from "@/pages/admin/finance/components/BudgetTable";
import { BudgetFormDialog } from "@/pages/admin/finance/components/BudgetFormDialog";
import { DuplicateBudgetDialog } from "@/pages/admin/finance/components/BudgetDuplicateFormDialog";

import type {
  Dimension,
  MonthlyBudgetCreateRequest,
  MonthlyBudgetSummary,
  MonthlyBudgetSuggestion,
} from "@/types/finance";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PAGE_HEADER_ACTIONS_CLASS } from "@/components/FormLabel";

function getEmptyBudget(): MonthlyBudgetCreateRequest {
  return {
    type_id: null,
    class_id: null,
    budget_month: "",
    planned_value: 0,
  };
}

export default function Budget() {
  const { toast } = useToast();
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<MonthlyBudgetSuggestion[]>([]);
  const [summary, setSummary] = useState<MonthlyBudgetSummary[]>([]);

  const filteredSuggestions = suggestions.filter((suggestion) => {
    return !summary.some(
      (budget) =>
        budget.type_id === suggestion.type_id &&
        budget.class_id === suggestion.class_id
    );
  });

  const budgetMonth = `${selectedYear}-${String(selectedMonth).padStart(
    2,
    "0"
  )}-01`;

  const [dimensions, setDimensions] = useState<Dimension[]>([]);

  const [open, setOpen] = useState(false);
  const [newBudget, setNewBudget] = useState<MonthlyBudgetCreateRequest>(
    getEmptyBudget()
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] =
    useState<MonthlyBudgetSummary | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const expenseBudgets = useMemo(() => {
    return summary.filter((item) => item.nature_name === "Despesa");
  }, [summary]);

  const incomeBudgets = useMemo(() => {
    return summary.filter((item) => item.nature_name === "Receita");
  }, [summary]);

  const totals = useMemo(() => {
    const parentBudgets = summary.filter((item) => item.class_id === null);

    const plannedExpense = parentBudgets
      .filter((item) => item.nature_name === "Despesa")
      .reduce((acc, item) => acc + Number(item.planned_value || 0), 0);

    const plannedIncome = parentBudgets
      .filter((item) => item.nature_name === "Receita")
      .reduce((acc, item) => acc + Number(item.planned_value || 0), 0);

    const expense = parentBudgets
      .filter((item) => item.nature_name === "Despesa")
      .reduce((acc, item) => acc + Number(item.expense_value || 0), 0);

    const income = parentBudgets
      .filter((item) => item.nature_name === "Receita")
      .reduce((acc, item) => acc + Number(item.income_value || 0), 0);

    return {
      plannedExpense,
      plannedIncome,
      expense,
      income,
      remainingExpenseBudget: plannedExpense - expense,
    };
  }, [summary]);

  const exceededBudgets = useMemo(() => {
    return summary.filter(
      (item) =>
        item.class_id === null &&
        item.nature_name === "Despesa" &&
        Number(item.remaining_value || 0) < 0
    );
  }, [summary]);

  const exceededAlerts = useMemo(() => {
    return exceededBudgets.map((parent) => {
      const children = summary.filter(
        (item) =>
          item.type_id === parent.type_id &&
          item.class_id !== null &&
          item.nature_name === "Despesa" &&
          Number(item.remaining_value || 0) < 0
      );

      const mainCause = children.sort(
        (a, b) =>
          Math.abs(Number(b.remaining_value || 0)) -
          Math.abs(Number(a.remaining_value || 0))
      )[0];

      return {
        parent,
        mainCause,
      };
    });
  }, [exceededBudgets, summary]);

  const exceededIncomeBudgets = useMemo(() => {
    return summary.filter(
      (item) =>
        item.class_id === null &&
        item.nature_name === "Receita" &&
        Number(item.income_value || 0) > Number(item.planned_value || 0)
    );
  }, [summary]);

  const projectedExpense = useMemo(() => {
    const today = new Date();

    const isCurrentMonth =
      selectedMonth === today.getMonth() + 1 &&
      selectedYear === today.getFullYear();

    if (!isCurrentMonth) {
      return totals.expense;
    }

    const dayOfMonth = today.getDate();
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

    if (dayOfMonth <= 0) return totals.expense;

    return Number(((totals.expense / dayOfMonth) * daysInMonth).toFixed(2));
  }, [totals.expense, selectedMonth, selectedYear]);

  async function duplicateBudget(
    months: string[],
    mode: "missing_only" | "replace"
  ) {
    await duplicateMonthlyBudgetApi(budgetMonth, months, mode);
    await loadBudgetData();
  }

  const loadSuggestions = useCallback(async () => {
    const data = await fetchMonthlyBudgetSuggestions(budgetMonth);
    setSuggestions(data);
  }, [budgetMonth]);

  async function applySuggestion(item: MonthlyBudgetSuggestion) {
    try {
      await createMonthlyBudgetApi({
        type_id: item.type_id,
        class_id: item.class_id,
        budget_month: budgetMonth,
        planned_value: Number(item.suggested_value || 0),
      });

      toast({
        title: "Orçamento criado",
        description: `${item.type_name} / ${item.class_name} criado com base na sugestão.`,
        duration: 2000,
      });

      await loadBudgetData();
      await loadSuggestions();
    } catch (error) {
      toast({
        title: "Erro",
        description: `Falha ao usar sugestão: ${error}`,
        variant: "destructive",
        duration: 2000,
      });
    }
  }

  const loadBudgetData = useCallback(async () => {
    setLoading(true);

    try {
      const summaryData = await fetchMonthlyBudgetSummary(budgetMonth);
      setSummary(summaryData);
    } finally {
      setLoading(false);
    }
  }, [budgetMonth]);

  async function loadDimensions() {
    const data = await fetchDimensions();
    setDimensions((data ?? []) as Dimension[]);
  }

  useEffect(() => {
    loadBudgetData();
    loadSuggestions();
  }, [loadBudgetData, loadSuggestions]);

  useEffect(() => {
    loadDimensions();
  }, []);

  function resetForm() {
    setNewBudget(getEmptyBudget());
    setIsEditing(false);
    setEditingBudgetId(null);
  }

  async function saveBudget() {
    const payload = {
      ...newBudget,
      budget_month: newBudget.budget_month || budgetMonth,
    };

    if (isEditing && editingBudgetId) {
      await updateMonthlyBudgetApi({
        id: editingBudgetId,
        ...payload,
      });
    } else {
      await createMonthlyBudgetApi(payload);
    }

    setOpen(false);
    resetForm();
    await loadBudgetData();
  }

  function handleEdit(budget: MonthlyBudgetSummary) {
    setIsEditing(true);
    setEditingBudgetId(budget.id);

    setNewBudget({
      type_id: budget.type_id,
      class_id: budget.class_id,
      budget_month: budget.budget_month,
      planned_value: Number(budget.planned_value),
    });

    setOpen(true);
  }

  async function deleteBudget() {
    if (!selectedBudget) return;

    setDeleteLoading(String(selectedBudget.id));

    try {
      await deleteMonthlyBudgetApi(selectedBudget.id);
      setSummary((prev) => prev.filter((item) => item.id !== selectedBudget.id));
      setConfirmOpen(false);
      setSelectedBudget(null);
      await loadBudgetData();
    } catch (error) {
      console.error("Erro ao excluir orçamento:", error);
    } finally {
      setDeleteLoading(null);
    }
  }

  return (
    <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 overflow-x-hidden">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">
            Orçamento mensal
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o planejado, gasto e restante por categoria.
          </p>
        </div>

        <div className={PAGE_HEADER_ACTIONS_CLASS}>
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:min-w-[240px]">
            <Select
              onValueChange={(value) => setSelectedMonth(Number(value))}
              value={String(selectedMonth)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>

              <SelectContent>
                {[...Array(12)].map((_, i) => {
                  const monthName = new Date(0, i).toLocaleString("pt-BR", {
                    month: "long",
                  });
                  const monthLabel =
                    monthName.charAt(0).toUpperCase() + monthName.slice(1);

                  return (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {monthLabel}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            <Select
              onValueChange={(value) => setSelectedYear(Number(value))}
              value={String(selectedYear)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>

              <SelectContent>
                {[...Array(currentYear - 2025 + 6)].map((_, i) => {
                  const year = 2025 + i;

                  return (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <BudgetFormDialog
            open={open}
            setOpen={setOpen}
            newBudget={newBudget}
            setNewBudget={setNewBudget}
            saveBudget={saveBudget}
            dimensions={dimensions}
            isEditing={isEditing}
            onClose={resetForm}
            defaultBudgetMonth={budgetMonth}
          />

          <DuplicateBudgetDialog
            currentMonth={selectedMonth}
            currentYear={selectedYear}
            disabled={summary.length === 0}
            onDuplicate={duplicateBudget}
          />
        </div>
      </section>

      <BudgetSummary
        plannedExpense={totals.plannedExpense}
        plannedIncome={totals.plannedIncome}
        expense={totals.expense}
        income={totals.income}
        projectedExpense={projectedExpense}
      />

      <BudgetAlerts
        exceededExpenses={exceededAlerts}
        exceededIncome={exceededIncomeBudgets}
      />

      {filteredSuggestions.length > 0 && (
        <section className="rounded-xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Sugestões automáticas</h2>
              <p className="text-sm text-muted-foreground">
                {filteredSuggestions.length} sugestão(ões) pela média dos
                últimos 3 meses.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSuggestions((prev) => !prev)}
            >
              {showSuggestions ? "Ocultar" : "Ver"}
            </Button>
          </div>

          {showSuggestions && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSuggestions.slice(0, 6).map((item) => (
                <div
                  key={`${item.type_id}-${item.class_id}`}
                  className="rounded-lg border p-3 space-y-3"
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {item.type_name} / {item.class_name}
                    </div>

                    <div className="mt-1 text-lg font-bold text-primary">
                      {Number(item.suggested_value || 0).toLocaleString(
                        "pt-BR",
                        {
                          style: "currency",
                          currency: "BRL",
                        }
                      )}
                    </div>

                    <p className="hidden sm:block text-xs text-muted-foreground">
                      Média dos últimos 3 meses
                    </p>
                  </div>

                  <Button
                    size="sm"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => applySuggestion(item)}
                  >
                    Usar sugestão
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <Tabs defaultValue="despesa" className="w-full">
        <TabsList>
          <TabsTrigger value="despesa">
            Despesas
          </TabsTrigger>
          <TabsTrigger value="receita">
            Receitas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="despesa" className="mt-4">
          <section className="w-full min-w-0 overflow-x-auto rounded-xl border border-border/60 bg-card/30">
            <BudgetTable
              budgets={expenseBudgets}
              loading={loading}
              confirmOpen={confirmOpen}
              setConfirmOpen={setConfirmOpen}
              selectedBudget={selectedBudget}
              setSelectedBudget={setSelectedBudget}
              deleteBudget={deleteBudget}
              deleteLoading={deleteLoading}
              handleEdit={handleEdit}
            />
          </section>
        </TabsContent>

        <TabsContent value="receita" className="mt-4">
          <section className="w-full min-w-0 overflow-x-auto rounded-xl border border-border/60 bg-card/30">
            <BudgetTable
              budgets={incomeBudgets}
              loading={loading}
              confirmOpen={confirmOpen}
              setConfirmOpen={setConfirmOpen}
              selectedBudget={selectedBudget}
              setSelectedBudget={setSelectedBudget}
              deleteBudget={deleteBudget}
              deleteLoading={deleteLoading}
              handleEdit={handleEdit}
            />
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}