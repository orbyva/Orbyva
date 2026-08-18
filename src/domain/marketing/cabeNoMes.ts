export const CABE_NO_MES_PATH = "/dentro-do-orcamento";
export const CABE_NO_MES_TITLE = "Está dentro do orçamento?";

export type CabeVerdict = "cabe" | "aperto" | "nao_cabe";

export type CabeNoMesInput = {
  income: number;
  bills: number;
  purchase: number;
};

export type CabeNoMesResult = {
  income: number;
  bills: number;
  purchase: number;
  afterBills: number;
  remaining: number;
  verdict: CabeVerdict;
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

function monthNamePt(date = new Date()): string {
  return date.toLocaleDateString("pt-BR", { month: "long" });
}

/**
 * Renda − contas fixas − compra (opcional).
 * Cabe / aperta / não cabe, sem login.
 */
export function evaluateCabeNoMes(
  input: CabeNoMesInput,
  now = new Date()
): CabeNoMesResult | null {
  const income = Number(input.income);
  const bills = Number(input.bills);
  const purchaseRaw = Number(input.purchase);

  if (!Number.isFinite(income) || income <= 0) return null;
  if (!Number.isFinite(bills) || bills < 0) return null;

  const purchase =
    Number.isFinite(purchaseRaw) && purchaseRaw > 0 ? purchaseRaw : 0;
  const afterBills = roundBRL(income - bills);
  const remaining = roundBRL(afterBills - purchase);
  const month = monthNamePt(now);

  if (remaining < 0) {
    const shortfall = roundBRL(Math.abs(remaining));
    return {
      income,
      bills,
      purchase,
      afterBills,
      remaining,
      verdict: "nao_cabe",
      headline: purchase
        ? "Essa compra fica fora do orçamento"
        : "As contas já passam da renda",
      detail: purchase
        ? `Depois das contas fixas, faltam ${formatPlain(shortfall)} para essa compra em ${month}.`
        : `As contas fixas passam da renda em ${formatPlain(shortfall)} em ${month}.`,
    };
  }

  const tightVsIncome = remaining < income * 0.1;
  const tightVsHeadroom =
    purchase > 0 && afterBills > 0 && remaining < afterBills * 0.2;
  const closesZero = remaining === 0;
  const aperto = closesZero || tightVsIncome || tightVsHeadroom;

  if (aperto) {
    return {
      income,
      bills,
      purchase,
      afterBills,
      remaining,
      verdict: "aperto",
      headline: remaining === 0 ? "Fecha zerado neste mês" : "Entra, mas aperta o orçamento",
      detail:
        remaining === 0
          ? purchase
            ? `A compra entra, e o mês fecha em ${formatPlain(0)} depois das contas.`
            : `Depois das contas, não sobra folga em ${month}.`
          : `Ainda restam ${formatPlain(remaining)} em ${month}, pouca folga se aparecer um imprevisto.`,
    };
  }

  return {
    income,
    bills,
    purchase,
    afterBills,
    remaining,
    verdict: "cabe",
    headline: `Ainda restam ${formatPlain(remaining)} no orçamento em ${month}`,
    detail: purchase
      ? "A compra entra e ainda sobra para o resto do mês."
      : "Depois das contas fixas, isso ainda dá para gastar neste mês.",
  };
}

export function cabeNoMesShareText(result: CabeNoMesResult): string {
  return [
    CABE_NO_MES_TITLE,
    result.headline,
    result.detail,
    `https://orbyva.app${CABE_NO_MES_PATH}`,
  ].join("\n");
}
