export const DUE_WARNING_DAYS = 5;

/** Marcador legado (horizonte longo) — ainda reconhecido na edição. */
export const LEGACY_FIXED_RECURRING_HORIZON = 60;

/** Máximo de parcelas em compra parcelada (Nx). */
export const MAX_SPLIT_INSTALLMENTS = 48;

export type FixedRecurringFrequency = "Mensal" | "Anual";

export function normalizeFixedFrequency(
  frequency?: string | null
): FixedRecurringFrequency {
  return frequency === "Anual" ? "Anual" : "Mensal";
}

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

/** Meses da data de início até dezembro de `endYear` (inclusivo). */
export function countMonthsThroughYear(
  startDateIso: string,
  endYear: number
): number {
  const start = new Date(`${startDateIso.slice(0, 10)}T12:00:00`);
  const startIdx = start.getFullYear() * 12 + start.getMonth();
  const endIdx = endYear * 12 + 11;
  return Math.max(1, endIdx - startIdx + 1);
}

/**
 * Plano fixo até o fim do ano da data de início.
 * Mensal → 1 parcela por mês até dez/AAAA.
 * Anual → 1 parcela no ano (vence na data de início / dia informado).
 */
export function buildFixedYearPlan(
  startDateIso: string,
  frequency: string = "Mensal"
): {
  installment_count: number;
  validity: string;
} {
  const validity = yearEndIsoFor(startDateIso);
  if (normalizeFixedFrequency(frequency) === "Anual") {
    return { installment_count: 1, validity };
  }
  return {
    installment_count: countMonthsThroughYearEnd(startDateIso),
    validity,
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

function resolveFixedPlanYear(rec: {
  validity?: string | null;
  payment_start_date?: string | null;
}): number {
  const validityYear = rec.validity?.slice(0, 4);
  if (validityYear && /^\d{4}$/.test(validityYear)) {
    return Number(validityYear);
  }
  const startYear = rec.payment_start_date?.slice(0, 4);
  if (startYear && /^\d{4}$/.test(startYear)) {
    return Number(startYear);
  }
  return new Date().getFullYear();
}

/**
 * Plano fixo elegível a renovar: tudo pago, ou o horizonte do ano já passou.
 */
export function canRenewFixedPlan(
  rec: {
    validity?: string | null;
    installment_count?: number | null;
    paid_parcels?: number[] | null;
    payment_start_date?: string | null;
    installments?: Array<{ dueDate: string }> | string;
  },
  todayIso: string = new Date().toISOString().slice(0, 10)
): boolean {
  if (!isFixedRecurringPlan(rec)) return false;

  const paidCount = (rec.paid_parcels || []).length;
  const total =
    Array.isArray(rec.installments) && rec.installments.length > 0
      ? rec.installments.length
      : Number(rec.installment_count) || 0;

  if (total > 0 && paidCount >= total) return true;

  const validity = rec.validity?.slice(0, 10);
  if (validity && validity < todayIso) return true;

  if (Array.isArray(rec.installments) && rec.installments.length > 0) {
    const lastDue = rec.installments[rec.installments.length - 1]?.dueDate;
    if (lastDue && lastDue < todayIso) return true;
  }

  return false;
}

/**
 * Estende o plano fixo até dezembro do ano seguinte, mantendo a data de início
 * e o histórico de parcelas (números / paid_parcels).
 */
export function buildRenewedFixedSchedule(rec: {
  frequency?: string | null;
  validity?: string | null;
  payment_start_date?: string | null;
}): {
  payment_start_date: string;
  installment_count: number;
  validity: string;
  year: number;
} {
  const nextYear = resolveFixedPlanYear(rec) + 1;
  const frequency = normalizeFixedFrequency(rec.frequency);
  const payment_start_date =
    rec.payment_start_date?.slice(0, 10) || `${nextYear - 1}-01-01`;
  const validity = `${nextYear}-12-31`;

  if (frequency === "Anual") {
    const startYear = Number(payment_start_date.slice(0, 4));
    const installment_count = Math.max(1, nextYear - startYear + 1);
    return {
      payment_start_date,
      installment_count,
      validity,
      year: nextYear,
    };
  }

  return {
    payment_start_date,
    installment_count: countMonthsThroughYear(payment_start_date, nextYear),
    validity,
    year: nextYear,
  };
}

/** Ano de vencimento da parcela N (1-based). */
export function dueYearForInstallment(
  paymentStartDate: string,
  installmentNumber: number,
  frequency: string = "Mensal"
): number {
  const start = new Date(`${paymentStartDate.slice(0, 10)}T12:00:00`);
  if (normalizeFixedFrequency(frequency) === "Anual") {
    return start.getFullYear() + (installmentNumber - 1);
  }
  const monthIndex =
    start.getFullYear() * 12 + start.getMonth() + (installmentNumber - 1);
  return Math.floor(monthIndex / 12);
}

export function buildFixedScheduleThroughYear(
  paymentStartDate: string,
  endYear: number,
  frequency: string = "Mensal"
): {
  payment_start_date: string;
  installment_count: number;
  validity: string;
} {
  const payment_start_date = paymentStartDate.slice(0, 10);
  const validity = `${endYear}-12-31`;

  if (normalizeFixedFrequency(frequency) === "Anual") {
    const startYear = Number(payment_start_date.slice(0, 4));
    return {
      payment_start_date,
      installment_count: Math.max(1, endYear - startYear + 1),
      validity,
    };
  }

  return {
    payment_start_date,
    installment_count: countMonthsThroughYear(payment_start_date, endYear),
    validity,
  };
}

/**
 * Se desfizer pagamento de um mês anterior ao horizonte renovado,
 * volta o plano para terminar no ano dessa parcela (remove meses do Renovar).
 * Não reverte se ainda houver parcelas pagas em anos posteriores.
 */
export function resolveFixedRenewalRollback(
  rec: {
    frequency?: string | null;
    validity?: string | null;
    payment_start_date?: string | null;
    installment_count?: number | null;
  },
  undoneInstallmentNumber: number,
  remainingPaidParcels: number[]
): {
  payment_start_date: string;
  installment_count: number;
  validity: string;
  paid_parcels: number[];
} | null {
  if (!isFixedRecurringPlan(rec)) return null;

  const start = rec.payment_start_date?.slice(0, 10);
  if (!start || undoneInstallmentNumber < 1) return null;

  const frequency = normalizeFixedFrequency(rec.frequency);
  const planEndYear = resolveFixedPlanYear(rec);
  const undoneYear = dueYearForInstallment(
    start,
    undoneInstallmentNumber,
    frequency
  );

  if (undoneYear >= planEndYear) return null;

  for (const number of remainingPaidParcels) {
    if (dueYearForInstallment(start, number, frequency) > undoneYear) {
      return null;
    }
  }

  const schedule = buildFixedScheduleThroughYear(start, undoneYear, frequency);
  return {
    ...schedule,
    paid_parcels: remainingPaidParcels.filter(
      (number) => number >= 1 && number <= schedule.installment_count
    ),
  };
}
