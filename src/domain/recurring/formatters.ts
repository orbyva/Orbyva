import type { Installments } from "@/types/recurring";
import { isFixedRecurringPlan, normalizeFixedFrequency } from "./constants";

export function formatInstallmentCount(count: number): string {
  return count === 1 ? "1 parcela" : `${count} parcelas`;
}

export function formatMonthYearShort(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  const month = date
    .toLocaleString("pt-BR", { month: "short" })
    .replace(".", "");
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
  return `${capitalized}/${date.getFullYear()}`;
}

export { formatDueDate, formatInstallmentLabel } from "./installments";

export interface InstallmentPlanSummary {
  title: string;
  subtitle: string;
}

export function formatInstallmentPlanSummary(rec: {
  installment_count: number | null;
  due_day: number | null;
  validity?: string | null;
  frequency?: string | null;
  installments?: Installments;
}): InstallmentPlanSummary | null {
  if (!rec.installment_count || !rec.due_day) return null;

  const fixed = isFixedRecurringPlan(rec);
  const annual = fixed && normalizeFixedFrequency(rec.frequency) === "Anual";
  const dueDayText = annual
    ? rec.due_day === 1
      ? "Vence no dia 1º"
      : `Vence no dia ${rec.due_day}`
    : rec.due_day === 1
      ? "Vence todo dia 1º"
      : `Vence todo dia ${rec.due_day}`;

  let subtitle = dueDayText;

  if (Array.isArray(rec.installments) && rec.installments.length > 0) {
    const first = rec.installments[0].dueDate;
    const last = rec.installments[rec.installments.length - 1].dueDate;
    if (fixed) {
      subtitle = annual
        ? `${dueDayText} · ${first.slice(0, 4)}`
        : `${dueDayText} · até ${formatMonthYearShort(last)}`;
    } else {
      subtitle = `${dueDayText} · ${formatMonthYearShort(first)} a ${formatMonthYearShort(last)}`;
    }
  } else if (fixed && rec.validity) {
    subtitle = annual
      ? `${dueDayText} · ${rec.validity.slice(0, 4)}`
      : `${dueDayText} · até ${formatMonthYearShort(rec.validity)}`;
  }

  return {
    title: fixed
      ? annual
        ? "Anual fixa"
        : "Mensal fixa"
      : formatInstallmentCount(rec.installment_count),
    subtitle,
  };
}
