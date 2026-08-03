/** Prefixo de lançamentos de viagem em Finanças. */
export const TRIP_LEDGER_PREFIX = "Viagem";

export function tripLedgerDescription(
  tripTitle: string,
  expenseDescription: string,
  options?: { shareSlice?: boolean }
): string {
  const title = tripTitle.trim() || "sem título";
  const detail = expenseDescription.trim();
  if (options?.shareSlice) {
    return `${TRIP_LEDGER_PREFIX} · ${title} (fatia): ${detail}`;
  }
  return `${TRIP_LEDGER_PREFIX} · ${title}: ${detail}`;
}

export function isTripLedgerDescription(
  description: string | null | undefined
): boolean {
  if (!description) return false;
  return /^viagem(\s|·|\()/i.test(description.trim());
}

export function sumTripSpendFromTransactions(
  rows: { description?: string | null; value?: number | null }[]
): number {
  return rows.reduce((sum, row) => {
    if (!isTripLedgerDescription(row.description)) return sum;
    return sum + Math.abs(Number(row.value) || 0);
  }, 0);
}
