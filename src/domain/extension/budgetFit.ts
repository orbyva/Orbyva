export type BudgetFitVerdict = "dentro" | "aperto" | "fora";

export type BudgetFitResult = {
  remaining: number;
  purchase: number;
  after: number;
  verdict: BudgetFitVerdict;
  headline: string;
  detail: string;
};

function roundBRL(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatPlain(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Compra vs restante do orçamento (já calculado no app).
 * Sem renda/contas — usa o número vivo do mês.
 */
export function evaluatePurchaseAgainstRemaining(
  remaining: number,
  purchase: number
): BudgetFitResult | null {
  if (!Number.isFinite(remaining)) return null;
  const buy =
    Number.isFinite(purchase) && purchase > 0 ? roundBRL(purchase) : 0;
  const rest = roundBRL(remaining);
  const after = roundBRL(rest - buy);

  if (after < 0) {
    const shortfall = roundBRL(Math.abs(after));
    return {
      remaining: rest,
      purchase: buy,
      after,
      verdict: "fora",
      headline: "Fora do orçamento",
      detail: buy
        ? `Essa compra passa do restante em ${formatPlain(shortfall)}.`
        : `O mês já está negativo em ${formatPlain(shortfall)}.`,
    };
  }

  const tight = after === 0 || (rest > 0 && after < rest * 0.2);
  if (buy > 0 && tight) {
    return {
      remaining: rest,
      purchase: buy,
      after,
      verdict: "aperto",
      headline: after === 0 ? "Entra, e zera o restante" : "Entra, mas aperta o orçamento",
      detail: `Depois dessa compra restam ${formatPlain(after)}.`,
    };
  }

  return {
    remaining: rest,
    purchase: buy,
    after,
    verdict: "dentro",
    headline: buy
      ? "Está dentro do orçamento"
      : `Restam ${formatPlain(rest)} no orçamento`,
    detail: buy
      ? `A compra entra e ainda sobram ${formatPlain(after)}.`
      : "Sem uma compra na página, este é o restante do mês.",
  };
}
