import { splitInstallmentValue } from "@/domain/recurring/values";
import { MAX_SPLIT_INSTALLMENTS } from "@/domain/recurring/constants";
import {
  buildPurchaseSimulation,
  formatYm,
  shiftYearMonth,
} from "@/domain/recurring/projection";
import { evaluatePurchaseAgainstRemaining, type BudgetFitResult } from "./budgetFit";

export const EXT_INSTALLMENT_PRESETS = [2, 3, 6, 10, 12, 18, 24] as const;

export type InstallmentOffer = {
  count: number;
  value: number;
};

export type InstallmentFit = {
  count: number;
  installmentValue: number;
  fromPage: boolean;
  fit: BudgetFitResult;
};

export type InstallmentCalendarRow = {
  year: number;
  month: number;
  number: number;
  value: number;
};

export type YearMonthStart = { year: number; month: number };

function parseOfferAmount(raw: string): number | null {
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function clampCount(count: number): number | null {
  const n = Math.floor(count);
  if (n < 2 || n > MAX_SPLIT_INSTALLMENTS) return null;
  return n;
}

function nearbyAfter(text: string, endIndex: number): string {
  const slice = text.slice(endIndex, endIndex + 40);
  const next = slice.search(
    /\d{1,2}\s*x(?:\s+sem\s+juros)?\s*(?:de\s*)?R\$/i
  );
  return next >= 0 ? slice.slice(0, next) : slice;
}

/**
 * Melhor oferta Nx no texto da página (Mercado Livre, Magalu, etc.).
 * Prefere “sem juros”; senão, o maior N encontrado.
 */
export function parseInstallmentOffer(text: string): InstallmentOffer | null {
  const re =
    /(\d{1,2})\s*x(?:\s+sem\s+juros)?\s*(?:de\s*)?R\$\s*([\d.]+,\d{2})/gi;
  let bestJuros: InstallmentOffer | null = null;
  let bestAny: InstallmentOffer | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const count = clampCount(Number(match[1]));
    const value = parseOfferAmount(match[2] ?? "");
    if (count == null || value == null || value <= 0) continue;
    const offer = { count, value };
    const nearby = nearbyAfter(text, match.index + match[0].length);
    const semJuros = /sem\s+juros/i.test(`${match[0]} ${nearby}`);
    if (semJuros && (!bestJuros || count > bestJuros.count)) bestJuros = offer;
    if (!bestAny || count > bestAny.count) bestAny = offer;
  }
  return bestJuros ?? bestAny;
}

/** Valor que cai neste mês se parcelar em `count`. */
export function installmentValueThisMonth(
  purchase: number,
  count: number,
  pageOffer: InstallmentOffer | null
): { value: number; fromPage: boolean } | null {
  const n = clampCount(count);
  if (n == null || !(purchase > 0)) return null;
  if (pageOffer && pageOffer.count === n && pageOffer.value > 0) {
    return { value: pageOffer.value, fromPage: true };
  }
  return { value: splitInstallmentValue(purchase, n), fromPage: false };
}

function formatPlain(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function installmentCopy(
  count: number,
  value: number,
  fromPage: boolean,
  fit: BudgetFitResult
): { headline: string; detail: string } {
  const n = `${count}x`;
  const parcela = formatPlain(value);
  const source = fromPage
    ? `Oferta da página: ${n} de ${parcela}.`
    : `${n} de ${parcela} (total ÷ ${count}).`;

  if (fit.verdict === "fora") {
    return {
      headline: "A 1ª parcela passa do restante",
      detail: `${source} Neste mês ela passa em ${formatPlain(Math.abs(fit.after))}.`,
    };
  }
  if (fit.verdict === "aperto") {
    return {
      headline:
        fit.after === 0
          ? "A 1ª parcela zera o restante"
          : "A 1ª parcela entra, mas aperta",
      detail: `${source} Depois dela restam ${formatPlain(fit.after)}.`,
    };
  }
  return {
    headline: "A 1ª parcela cabe neste mês",
    detail: `${source} Depois dela ainda sobram ${formatPlain(fit.after)}.`,
  };
}

export function evaluateInstallmentAgainstRemaining(
  remaining: number,
  purchase: number,
  count: number,
  pageOffer: InstallmentOffer | null
): InstallmentFit | null {
  const split = installmentValueThisMonth(purchase, count, pageOffer);
  if (!split) return null;
  const base = evaluatePurchaseAgainstRemaining(remaining, split.value);
  if (!base) return null;
  const copy = installmentCopy(
    Math.floor(count),
    split.value,
    split.fromPage,
    base
  );
  return {
    count: Math.floor(count),
    installmentValue: split.value,
    fromPage: split.fromPage,
    fit: { ...base, headline: copy.headline, detail: copy.detail },
  };
}

/** Compara à vista vs 1ª parcela neste mês. */
export function cashVsInstallmentHint(
  cash: BudgetFitResult,
  installment: InstallmentFit
): string {
  const n = installment.count;
  const cashIn = cash.verdict !== "fora";
  const instIn = installment.fit.verdict !== "fora";
  if (!cashIn && instIn) {
    return `À vista não cabe. Em ${n}x, a 1ª parcela entra neste mês.`;
  }
  if (!cashIn && !instIn) {
    return "Nem o total à vista nem a 1ª parcela cabem no restante deste mês.";
  }
  if (cashIn && instIn) {
    return `Cabe à vista. Em ${n}x, o impacto deste mês cai para a 1ª parcela.`;
  }
  return `Em ${n}x a 1ª parcela passa do restante (oferta com juros).`;
}

/**
 * Parcela por mês, da 1ª (mês atual) até a última.
 * Oferta da página → valor fixo; senão, divide o à vista (última absorve o centavo).
 */
export function buildInstallmentCalendar(
  start: YearMonthStart,
  purchase: number,
  count: number,
  pageOffer: InstallmentOffer | null
): InstallmentCalendarRow[] | null {
  const n = clampCount(count);
  if (n == null || !(purchase > 0)) return null;
  const split = installmentValueThisMonth(purchase, n, pageOffer);
  if (!split) return null;

  if (split.fromPage) {
    return Array.from({ length: n }, (_, i) => {
      const ym = shiftYearMonth(start, i);
      return {
        year: ym.year,
        month: ym.month,
        number: i + 1,
        value: split.value,
      };
    });
  }

  const sim = buildPurchaseSimulation({
    total: purchase,
    installmentCount: n,
    start,
  });
  if (!sim) return null;

  return Array.from({ length: n }, (_, i) => {
    const ym = shiftYearMonth(start, i);
    return {
      year: ym.year,
      month: ym.month,
      number: i + 1,
      value: sim.byYm[formatYm(ym.year, ym.month)] ?? split.value,
    };
  });
}
