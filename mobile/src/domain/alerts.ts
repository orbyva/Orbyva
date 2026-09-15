import { getDocumentAlerts, getMaintenanceAlerts } from "@/domain/car";
import { getRecurringDueAlerts } from "@/domain/recurring/alerts";
import type { Maintenance, Vehicle, VehicleDocument } from "@/types/car";
import type { MonthlyBudgetSummary } from "@/types/finance";
import type { PersonalGoal } from "@/types/goals";
import type { Recurring } from "@/types/recurring";
import type { AppHref } from "@/lib/nav";

export type AppAlertKind =
  | "recurring_overdue"
  | "recurring_upcoming"
  | "maintenance"
  | "document"
  | "budget"
  | "task_overdue"
  | "goal_due"
  | "goal_overdue"
  | "series_episode";

export type AppAlert = {
  id: string;
  kind: AppAlertKind;
  severity: "danger" | "warning" | "info" | "success";
  title: string;
  message: string;
  href: Exclude<AppHref, null>;
};

function daysUntil(isoDate: string, now = new Date()): number {
  const target = new Date(`${isoDate}T12:00:00`);
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  return Math.ceil((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildAppAlerts(input: {
  recurring: Recurring[];
  budgets: MonthlyBudgetSummary[];
  overdueTasks?: number;
  vehicles?: Vehicle[];
  maintenances?: Maintenance[];
  documents?: VehicleDocument[];
  goals?: PersonalGoal[];
  seriesAlerts?: AppAlert[];
}): AppAlert[] {
  const alerts: AppAlert[] = [];

  for (const alert of getRecurringDueAlerts(input.recurring)) {
    const name =
      alert.recurring.description || alert.recurring.class?.name || "Parcela";
    alerts.push({
      id: `rec-${alert.recurring.id}-${alert.installmentNumber}`,
      kind: alert.status === "overdue" ? "recurring_overdue" : "recurring_upcoming",
      severity: alert.status === "overdue" ? "danger" : "warning",
      title: name,
      message: alert.message,
      href: "/finance/recurring",
    });
  }

  for (const row of input.budgets) {
    if (Number(row.remaining_value) >= 0) continue;
    const name = row.class_name
      ? `${row.type_name} / ${row.class_name}`
      : row.type_name;
    const isIncome = /receita/i.test(row.nature_name || "");
    alerts.push({
      id: `budget-${row.id}-${row.class_id ?? "p"}`,
      kind: "budget",
      severity: isIncome ? "success" : "danger",
      title: isIncome ? "Receita acima do previsto" : "Orçamento estourado",
      message: isIncome
        ? `${name} superou a meta, ótimo sinal.`
        : `${name} passou do planejado.`,
      href: "/finance/budget",
    });
  }

  const overdueTasks = input.overdueTasks ?? 0;
  if (overdueTasks > 0) {
    alerts.push({
      id: "tasks-overdue",
      kind: "task_overdue",
      severity: "danger",
      title: "Tarefas atrasadas",
      message:
        overdueTasks === 1
          ? "1 tarefa passou do prazo."
          : `${overdueTasks} tarefas passaram do prazo.`,
      href: "/tasks",
    });
  }

  for (const vehicle of input.vehicles ?? []) {
    const label = `${vehicle.brand} ${vehicle.model}`.trim();
    const vehicleMaint = (input.maintenances ?? []).filter(
      (m) => m.vehicle_id === vehicle.id
    );
    const vehicleDocs = (input.documents ?? []).filter(
      (d) => d.vehicle_id === vehicle.id
    );
    for (const m of getMaintenanceAlerts(vehicle, vehicleMaint)) {
      alerts.push({
        id: `maint-${vehicle.id}-${m.type}`,
        kind: "maintenance",
        severity: m.status === "overdue" ? "danger" : "warning",
        title: `${label}: manutenção`,
        message: m.message,
        href: "/cars",
      });
    }
    for (const d of getDocumentAlerts(vehicleDocs)) {
      alerts.push({
        id: `doc-${d.document.id}`,
        kind: "document",
        severity: d.status === "overdue" ? "danger" : "warning",
        title: `${label}: documento`,
        message: d.message,
        href: "/cars",
      });
    }
  }

  for (const goal of input.goals ?? []) {
    if (goal.status !== "active" || !goal.deadline) continue;
    const d = daysUntil(goal.deadline);
    if (d < 0) {
      alerts.push({
        id: `goal-overdue-${goal.id}`,
        kind: "goal_overdue",
        severity: "danger",
        title: goal.title,
        message: `Meta atrasada (${Math.abs(d)} dia${Math.abs(d) === 1 ? "" : "s"}).`,
        href: "/goals",
      });
    } else if (d <= 7) {
      alerts.push({
        id: `goal-due-${goal.id}`,
        kind: "goal_due",
        severity: d <= 2 ? "warning" : "info",
        title: goal.title,
        message:
          d === 0
            ? "Prazo da meta é hoje."
            : `Prazo em ${d} dia${d === 1 ? "" : "s"}.`,
        href: "/goals",
      });
    }
  }

  if (input.seriesAlerts?.length) {
    alerts.push(...input.seriesAlerts);
  }

  const order = { danger: 0, warning: 1, info: 2, success: 3 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function pickEpisodeForAlert(
  meta: {
    last_episode_to_air?: {
      season_number: number;
      episode_number: number;
      name?: string | null;
      air_date?: string | null;
    } | null;
    next_episode_to_air?: {
      season_number: number;
      episode_number: number;
      name?: string | null;
      air_date?: string | null;
    } | null;
  },
  lookbackDays = 14
): {
  season_number: number;
  episode_number: number;
  name?: string | null;
  air_date: string;
} | null {
  const last = meta.last_episode_to_air;
  const next = meta.next_episode_to_air;
  if (next?.air_date) {
    const d = daysUntil(next.air_date.slice(0, 10));
    if (d <= 0 && d >= -lookbackDays) {
      return { ...next, air_date: next.air_date.slice(0, 10) };
    }
  }
  if (last?.air_date) {
    const d = daysUntil(last.air_date.slice(0, 10));
    if (d <= 0 && d >= -lookbackDays) {
      return { ...last, air_date: last.air_date.slice(0, 10) };
    }
  }
  return null;
}

export function daysUntilIso(isoDate: string, now = new Date()): number {
  return daysUntil(isoDate, now);
}
