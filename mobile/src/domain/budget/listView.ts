import type { MonthlyBudgetSummary } from "@/types/finance";

export type BudgetGroup = {
  typeName: string;
  parent: MonthlyBudgetSummary;
  children: MonthlyBudgetSummary[];
};

export function getBudgetRealizedValue(
  budget?: MonthlyBudgetSummary | null
): number {
  if (!budget) return 0;
  return budget.nature_name === "Receita"
    ? Number(budget.income_value || 0)
    : Number(budget.expense_value ?? budget.spent_value ?? 0);
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
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
  const first = items[0]!;
  const planned = items.reduce(
    (sum, item) => sum + Number(item.planned_value || 0),
    0
  );
  const realized = items.reduce(
    (sum, item) => sum + getBudgetRealizedValue(item),
    0
  );
  const remaining = planned - realized;
  const percentage = planned > 0 ? (realized / planned) * 100 : 0;

  return {
    ...first,
    id: first.id ?? 0,
    type_name: typeName,
    class_id: null,
    class_name: null,
    planned_value: planned,
    income_value: first.nature_name === "Receita" ? realized : 0,
    expense_value: first.nature_name === "Receita" ? 0 : realized,
    spent_value: first.nature_name === "Receita" ? 0 : realized,
    remaining_value: remaining,
    percentage_used: percentage,
    status: getStatusFromPercentage(percentage, first.nature_name),
  };
}

export function groupBudgetsByType(
  budgets: MonthlyBudgetSummary[]
): BudgetGroup[] {
  const grouped = new Map<string, MonthlyBudgetSummary[]>();

  for (const budget of budgets) {
    const key = budget.type_name?.trim() || "Sem categoria";
    const list = grouped.get(key) ?? [];
    list.push(budget);
    grouped.set(key, list);
  }

  const groups: BudgetGroup[] = [];

  for (const [typeName, items] of grouped) {
    const parent =
      items.find((item) => item.class_id == null) ??
      createGroupSummary(typeName, items);
    const children = items
      .filter((item) => item.class_id != null)
      .sort((a, b) =>
        compareText(a.class_name?.trim() || "", b.class_name?.trim() || "")
      );

    groups.push({ typeName, parent, children });
  }

  return groups.sort((a, b) => compareText(a.typeName, b.typeName));
}
