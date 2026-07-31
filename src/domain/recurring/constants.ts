export const DUE_WARNING_DAYS = 5;

/** Marcador legado (horizonte longo) — ainda reconhecido na edição. */
export const LEGACY_FIXED_RECURRING_HORIZON = 60;

/** Máximo de parcelas em compra parcelada (Nx). */
export const MAX_SPLIT_INSTALLMENTS = 48;

export function yearEndIsoFor(startDateIso: string): string {
  const year = new Date(`${startDateIso.slice(0, 10)}T12:00:00`).getFullYear();
  return `${year}-12-31`;
}

/** Meses da data de início até dezembro do mesmo ano (inclusivo). */
export function countMonthsThroughYearEnd(startDateIso: string): number {
  const start = new Date(`${startDateIso.slice(0, 10)}T12:00:00`);
  const startMonth = start.getMonth(); // 0–11
  return 12 - startMonth;
}

export function buildFixedYearPlan(startDateIso: string): {
  installment_count: number;
  validity: string;
} {
  return {
    installment_count: countMonthsThroughYearEnd(startDateIso),
    validity: yearEndIsoFor(startDateIso),
  };
}

export function isFixedRecurringPlan(rec: {
  validity?: string | null;
  installment_count?: number | null;
}): boolean {
  const validity = rec.validity?.slice(0, 10);
  if (validity && /^\d{4}-12-31$/.test(validity)) return true;
  if (rec.installment_count === LEGACY_FIXED_RECURRING_HORIZON) return true;
  return false;
}
