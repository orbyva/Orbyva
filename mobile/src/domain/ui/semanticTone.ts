import type { ThemeColor } from "@/constants/theme";
import type { AppAlert } from "@/domain/alerts";
import type { BadgeVariant } from "@/domain/ui/variants/badge";
import type { MaintenanceAlertStatus } from "@/types/car";

/** Token do status de teto do orçamento (aceita com ou sem acento, qualquer caixa). */
export function budgetStatusTone(status: string): ThemeColor {
  const key = status
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (key === "ESTOUROU" || key === "CRITICO") return "destructive";
  if (key === "ATENCAO" || key === "QUASE") return "warning";
  return "success";
}

/** Token da natureza do lançamento: Receita entra, Investimento guarda, o resto sai. */
export function natureTone(name?: string | null): ThemeColor {
  if (name === "Receita") return "success";
  if (name === "Investimento") return "chart6";
  return "destructive";
}

/** Token do status da tarefa: a fazer neutro, fazendo em destaque, feita em sucesso. */
export function taskStatusTone(status: string): ThemeColor {
  if (status === "doing") return "primary";
  if (status === "done") return "success";
  return "mutedForeground";
}

/** Token do saldo: zero conta como positivo. */
export function netTone(value: number): ThemeColor {
  return value >= 0 ? "success" : "destructive";
}

/** Badge de vencimento de documento/manutenção do carro; em dia não ganha badge. */
export function carAlertBadge(
  status: MaintenanceAlertStatus | undefined
): { variant: BadgeVariant; label: string } | null {
  if (status === "overdue") return { variant: "destructive", label: "Vencido" };
  if (status === "upcoming") return { variant: "warning", label: "Em breve" };
  return null;
}

/** Cor da severidade de um alerta do app. */
export function alertSeverityTone(severity: AppAlert["severity"]): ThemeColor {
  if (severity === "danger") return "destructive";
  if (severity === "warning") return "warning";
  if (severity === "success") return "success";
  return "mutedForeground";
}
