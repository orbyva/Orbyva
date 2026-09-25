import { formatDateBR } from "@/lib/currency";
import type { Installment, Installments } from "@/types/recurring";

export function formatDueDate(isoDate: string): string {
  return formatDateBR(isoDate);
}

export function formatInstallmentLabel(number: number, dueDate: string): string {
  return `Parcela ${number} · vence em ${formatDueDate(dueDate)}`;
}

export function getInstallmentDueDate(
  startDate: string,
  dueDay: number,
  installmentNumber: number
): Date {
  const start = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  const monthOffset = installmentNumber - 1;
  const targetMonth = start.getMonth() + monthOffset;
  const targetYear = start.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const day = Math.min(dueDay, lastDay);
  return new Date(targetYear, normalizedMonth, day);
}

/** Parcela anual: mesmo mês/dia, avançando 1 ano por número. */
export function getAnnualInstallmentDueDate(
  startDate: string,
  dueDay: number,
  installmentNumber: number
): Date {
  const start = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  const targetYear = start.getFullYear() + (installmentNumber - 1);
  const month = start.getMonth();
  const lastDay = new Date(targetYear, month + 1, 0).getDate();
  const day = Math.min(dueDay, lastDay);
  return new Date(targetYear, month, day);
}

function toIsoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function resolvePaymentStartDate(rec: {
  payment_start_date: string | null;
  created_at: string;
}): string {
  return rec.payment_start_date?.slice(0, 10) || rec.created_at.slice(0, 10);
}

export function calculateInstallments(
  startDate: string,
  dueDay: number | null,
  installmentCount: number | null,
  validity: string | null = null,
  frequency: string | null = null
): Installments {
  if (installmentCount && installmentCount > 0 && dueDay) {
    const installments: Installment[] = [];
    const annual = frequency === "Anual";

    for (let i = 1; i <= installmentCount; i++) {
      const dueDate = annual
        ? getAnnualInstallmentDueDate(startDate, dueDay, i)
        : getInstallmentDueDate(startDate, dueDay, i);
      const dueDateIso = toIsoDateLocal(dueDate);

      installments.push({
        label: formatInstallmentLabel(i, dueDateIso),
        number: i,
        dueDate: dueDateIso,
      });
    }

    return installments;
  }

  if (!validity) return "Essa recorrência não é um parcelamento";

  const createdDate = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  const validityDate = new Date(`${validity.slice(0, 10)}T12:00:00`);
  const legacyDueDay = validityDate.getDate();
  const installments: Installment[] = [];
  const currentDate = new Date(createdDate);

  while (currentDate <= validityDate) {
    const installmentNumber = installments.length + 1;
    const dueDate = getInstallmentDueDate(startDate, legacyDueDay, installmentNumber);
    const dueDateIso = toIsoDateLocal(dueDate);

    installments.push({
      label: formatInstallmentLabel(installmentNumber, dueDateIso),
      number: installmentNumber,
      dueDate: dueDateIso,
    });

    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return installments;
}
