import { getRecurringDueAlerts } from "@/domain/recurring/alerts";
import type { MonthlyBudgetSummary } from "@/types/finance";
import type { Recurring, RecurringDueAlert } from "@/types/recurring";

export type AppAlert = {
  id: string;
  severity: "danger" | "warning" | "info";
  title: string;
  message: string;
  href: "/finance" | "/finance/transactions" | "/tasks";
};

export function alertsFromRecurring(alerts: RecurringDueAlert[]): AppAlert[] {
  return alerts.map((alert) => ({
    id: `rec-${alert.recurring.id}-${alert.installmentNumber}`,
    severity: alert.status === "overdue" ? "danger" : "warning",
    title: alert.status === "overdue" ? "Conta atrasada" : "Vencimento próximo",
    message: alert.message,
    href: "/finance",
  }));
}

export function alertsFromBudgets(rows: MonthlyBudgetSummary[]): AppAlert[] {
  const expenses = rows.filter((b) => /despesa/i.test(b.nature_name || ""));
  const parents = expenses.filter((b) => b.class_id == null);
  const ceilingRows = parents.length > 0 ? parents : expenses;
  if (expenses.length === 0) return [];

  const alerts: AppAlert[] = [];
  const planned = ceilingRows.reduce(
    (s, b) => s + Number(b.planned_value || 0),
    0
  );
  const spent = ceilingRows.reduce((s, b) => s + Number(b.spent_value || 0), 0);
  const pct = planned > 0 ? (spent / planned) * 100 : 0;

  for (const row of expenses) {
    if (Number(row.remaining_value) >= 0) continue;
    const name = row.class_name
      ? `${row.type_name} / ${row.class_name}`
      : row.type_name;
    alerts.push({
      id: `budget-${row.id}-${row.class_id ?? "p"}`,
      severity: "danger",
      title: "Orçamento estourado",
      message: `${name} passou do planejado.`,
      href: "/finance",
    });
  }

  if (alerts.length === 0 && planned > 0 && pct >= 80) {
    alerts.push({
      id: "budget-ceiling",
      severity: pct >= 100 ? "danger" : "warning",
      title: pct >= 100 ? "Orçamento estourado" : "Orçamento no limite",
      message:
        pct >= 100
          ? "As despesas do mês passaram do teto."
          : `${pct.toFixed(0)}% do teto do mês já foi usado.`,
      href: "/finance",
    });
  }

  return alerts;
}

export function buildAppAlerts(
  recurring: Recurring[],
  budgets: MonthlyBudgetSummary[],
  overdueTasks = 0
): AppAlert[] {
  const order = { danger: 0, warning: 1, info: 2 };
  const taskAlerts: AppAlert[] =
    overdueTasks > 0
      ? [
          {
            id: "tasks-overdue",
            severity: "danger",
            title: "Tarefas atrasadas",
            message:
              overdueTasks === 1
                ? "1 tarefa passou do prazo."
                : `${overdueTasks} tarefas passaram do prazo.`,
            href: "/tasks",
          },
        ]
      : [];
  return [
    ...alertsFromRecurring(getRecurringDueAlerts(recurring)),
    ...alertsFromBudgets(budgets),
    ...taskAlerts,
  ].sort((a, b) => order[a.severity] - order[b.severity]);
}
