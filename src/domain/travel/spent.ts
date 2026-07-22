/** Total do grupo: só despesas com visibility = shared. */
export function sumSharedTripSpent(
  expenses: { amount: number | string; visibility?: string | null }[]
): number {
  return expenses.reduce((sum, e) => {
    if ((e.visibility ?? "personal") !== "shared") return sum;
    return sum + Number(e.amount);
  }, 0);
}

/**
 * Solo: soma tudo (pessoal = o ledger da viagem).
 * Compartilhada: só shared (pessoal não vaza no spent do grupo).
 */
export function sumTripSpent(
  expenses: { amount: number | string; visibility?: string | null }[],
  sharedTrip: boolean
): number {
  if (!sharedTrip) {
    return expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  }
  return sumSharedTripSpent(expenses);
}
