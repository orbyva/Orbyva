import type { Class } from "@/types/dimensions";

export const NATURE_RECEITA = "Receita";
export const NATURE_DESPESA = "Despesa";
export const NATURE_INVESTIMENTO = "Investimento";

/** Tipo legado de aporte (ainda pode existir no ledger). */
export const INVESTIMENTO_TYPE_NAME = "Investimento";

/** Tipo atual dos aportes de meta (sob natureza Investimento). */
export const META_TYPE_NAME = "Meta";

/** @deprecated prefer INVESTIMENTO_TYPE_NAME */
export const POUPANCA_TYPE_NAME = "Poupança";
export const POUPANCA_CLASS_NAME = "Aporte meta";

export function isInvestmentNature(name?: string | null): boolean {
  return (name ?? "").trim().toLowerCase() === "investimento";
}

/** Aceita `null` (payloads aninhados do Supabase / ledger). */
type SpendFlagType = {
  exclude_from_spend?: boolean | null;
};

export function typeExcludesFromSpend(type?: SpendFlagType | null): boolean {
  return Boolean(type?.exclude_from_spend);
}

/** Conta no gasto do mês / teto? Receita e Investimento não; Despesa só se não for exclude_from_spend. */
export function countsAsMonthlySpend(
  natureName?: string | null,
  type?: SpendFlagType | null
): boolean {
  const n = (natureName ?? "").trim();
  if (!n || n === NATURE_RECEITA || isInvestmentNature(n)) return false;
  if (n === NATURE_DESPESA) return !typeExcludesFromSpend(type);
  return false;
}

export function classExcludesFromSpend(
  cls?: Pick<Class, "type"> | null
): boolean {
  const nature = cls?.type?.nature?.name;
  if (isInvestmentNature(nature)) return true;
  return typeExcludesFromSpend(cls?.type ?? null);
}
