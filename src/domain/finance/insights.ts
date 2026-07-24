/** Insights mês a mês do ledger (Fase D) — puro, sem I/O. */

const MONTH_SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

export type YearMonth = { year: number; month: number };

export function previousYearMonth(year: number, month: number): YearMonth {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function monthShortLabel(month: number): string {
  return MONTH_SHORT[Math.max(1, Math.min(12, month)) - 1] ?? "";
}

/**
 * Texto curto tipo "↓12% vs jun".
 * `null` se não há base de comparação útil.
 */
export function formatMomTrend(
  current: number,
  previous: number | null | undefined,
  previousMonth: number
): string | null {
  if (previous == null) return null;
  const label = monthShortLabel(previousMonth);
  if (previous === 0 && current === 0) return null;
  if (previous === 0) {
    return current === 0 ? null : `novo vs ${label}`;
  }
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (pct === 0) return `estável vs ${label}`;
  const arrow = pct > 0 ? "↑" : "↓";
  return `${arrow}${Math.abs(pct)}% vs ${label}`;
}

export type MonthTotals = {
  receita: number;
  despesa: number;
};

export type MomTrends = {
  receita: string | null;
  despesa: string | null;
  saldo: string | null;
};

/** Compara totais do mês selecionado com o mês anterior. */
export function buildMomTrends(
  current: MonthTotals | null | undefined,
  previous: MonthTotals | null | undefined,
  previousMonth: number
): MomTrends {
  if (!current) {
    return { receita: null, despesa: null, saldo: null };
  }
  const prev = previous ?? null;
  const curSaldo = current.receita - current.despesa;
  const prevSaldo = prev ? prev.receita - prev.despesa : null;
  return {
    receita: formatMomTrend(current.receita, prev?.receita, previousMonth),
    despesa: formatMomTrend(current.despesa, prev?.despesa, previousMonth),
    saldo: formatMomTrend(curSaldo, prevSaldo, previousMonth),
  };
}
