import type { MonthlyBudgetSummary } from "@/types/finance";
import type { SortState } from "@/components/SortableTableHead";
import { toggleSort } from "@/components/SortableTableHead";

export type BudgetSortKey =
  | "type"
  | "planned"
  | "realized"
  | "remaining"
  | "usage"
  | "status";

export type BudgetSortState = SortState<BudgetSortKey>;

export { toggleSort };

export type BudgetGroup = {
  typeName: string;
  parent: MonthlyBudgetSummary;
  children: MonthlyBudgetSummary[];
};

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

export function getBudgetRealizedValue(
  budget?: MonthlyBudgetSummary | null
): number {
  if (!budget) return 0;
  return budget.nature_name === "Receita"
    ? Number(budget.income_value || 0)
    : Number(budget.expense_value ?? budget.spent_value ?? 0);
}

function statusRank(status?: string | null): number {
  const key = (status ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const map: Record<string, number> = {
    OK: 0,
    QUASE: 1,
    ATENCAO: 2,
    CRITICO: 3,
    ESTOUROU: 4,
  };
  return map[key] ?? 50;
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
    id: first.id ?? typeName,
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
  } as MonthlyBudgetSummary;
}

function compareBudgetRows(
  a: MonthlyBudgetSummary,
  b: MonthlyBudgetSummary,
  sort: BudgetSortState
): number {
  const mult = sort.dir === "asc" ? 1 : -1;

  switch (sort.key) {
    case "type": {
      const byType = compareText(
        a.type_name?.trim() || "Sem categoria",
        b.type_name?.trim() || "Sem categoria"
      );
      if (byType !== 0) return byType * mult;
      const classA = a.class_name?.trim() || "";
      const classB = b.class_name?.trim() || "";
      // Pais (sem classe) primeiro; depois classe crescente
      if (!classA && classB) return -1;
      if (classA && !classB) return 1;
      return compareText(classA, classB);
    }
    case "planned":
      return (Number(a.planned_value || 0) - Number(b.planned_value || 0)) * mult;
    case "realized":
      return (getBudgetRealizedValue(a) - getBudgetRealizedValue(b)) * mult;
    case "remaining":
      return (
        (Number(a.remaining_value || 0) - Number(b.remaining_value || 0)) * mult
      );
    case "usage":
      return (
        (Number(a.percentage_used || 0) - Number(b.percentage_used || 0)) * mult
      );
    case "status": {
      const byStatus = statusRank(a.status) - statusRank(b.status);
      if (byStatus !== 0) return byStatus * mult;
      return compareText(a.type_name || "", b.type_name || "");
    }
  }
}

function compareGroups(a: BudgetGroup, b: BudgetGroup, sort: BudgetSortState): number {
  return compareBudgetRows(a.parent, b.parent, sort);
}

export function buildSortedBudgetGroups(
  budgets: MonthlyBudgetSummary[],
  sort: BudgetSortState
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
      items.find((item) => item.class_id === null) ??
      createGroupSummary(typeName, items);
    const children = items
      .filter((item) => item.class_id !== null)
      .sort((a, b) => {
        if (sort.key === "type") {
          return compareText(
            a.class_name?.trim() || "",
            b.class_name?.trim() || ""
          );
        }
        return compareBudgetRows(a, b, sort);
      });

    groups.push({ typeName, parent, children });
  }

  return groups.sort((a, b) => compareGroups(a, b, sort));
}
