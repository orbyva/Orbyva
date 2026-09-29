import { formatDateBR } from "@/lib/currency";
import type { Installment, Installments } from "@/types/recurring";
import {
  calculateInstallmentDueDates,
  getAnnualInstallmentDueDate,
  getInstallmentDueDate,
  resolvePaymentStartDate,
  toIsoDateLocal,
} from "../../../supabase/functions/_shared/orb/recurring.ts";

/**
 * A regra de vencimento das parcelas mora em `supabase/functions/_shared/orb/recurring.ts` porque
 * as tools da Orb (Deno na Edge, Node no MCP) precisam da MESMA conta — `simulate_month_balance`
 * projeta o saldo do mês em cima dela. Aqui fica só o que é de apresentação (o rótulo em PT-BR),
 * que depende de `@/lib/currency` e não pode atravessar para o diretório compartilhado.
 */
export {
  getAnnualInstallmentDueDate,
  getInstallmentDueDate,
  resolvePaymentStartDate,
  toIsoDateLocal,
};

export function formatDueDate(isoDate: string): string {
  return formatDateBR(isoDate);
}

export function formatInstallmentLabel(number: number, dueDate: string): string {
  return `Parcela ${number} · vence em ${formatDueDate(dueDate)}`;
}

export function calculateInstallments(
  startDate: string,
  dueDay: number | null,
  installmentCount: number | null,
  validity: string | null = null,
  frequency: string | null = null
): Installments {
  const dues = calculateInstallmentDueDates(
    startDate,
    dueDay,
    installmentCount,
    validity,
    frequency
  );
  if (!dues) return "Essa recorrência não é um parcelamento";

  const installments: Installment[] = dues.map((due) => ({
    label: formatInstallmentLabel(due.number, due.dueDate),
    number: due.number,
    dueDate: due.dueDate,
  }));

  return installments;
}
