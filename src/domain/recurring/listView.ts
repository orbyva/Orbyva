import type { Recurring } from "@/types/recurring";
import { countsAsMonthlySpend, NATURE_RECEITA } from "@/domain/finance/spendFlags";
import { getRecurringProgress } from "./alerts";

export type RecurringNatureFilter = "all" | "receive" | "pay";

export type RecurringSortKey =
  | "type"
  | "class"
  | "value"
  | "frequency"
  | "installments"
  | "balance";

export type RecurringSortDir = "asc" | "desc";

export type RecurringSortState = {
  key: RecurringSortKey;
  dir: RecurringSortDir;
};

function natureOf(rec: Recurring): string | undefined {
  return rec.class?.type?.nature?.name;
}

/** A receber = Receita; A pagar = despesa que conta no mês (mesma regra da Projeção). */
export function recurringNatureSide(
  rec: Recurring
): "receive" | "pay" | null {
  const nature = natureOf(rec);
  if (nature === NATURE_RECEITA) return "receive";
  if (countsAsMonthlySpend(nature, rec.class?.type ?? null)) return "pay";
  return null;
}

export function filterRecurringByNature(
  list: Recurring[],
  filter: RecurringNatureFilter
): Recurring[] {
  if (filter === "all") return list;
  return list.filter((rec) => recurringNatureSide(rec) === filter);
}

export function countRecurringByNature(list: Recurring[]): {
  all: number;
  receive: number;
  pay: number;
} {
  let receive = 0;
  let pay = 0;
  for (const rec of list) {
    const side = recurringNatureSide(rec);
    if (side === "receive") receive += 1;
    else if (side === "pay") pay += 1;
  }
  return { all: list.length, receive, pay };
}

function remainingBalance(rec: Recurring): number {
  const progress = getRecurringProgress(rec);
  if (!progress || !rec.value) return 0;
  return progress.open * Number(rec.value);
}

function installmentSortValue(rec: Recurring): number {
  if (rec.installment_count != null) return Number(rec.installment_count);
  return getRecurringProgress(rec)?.total ?? 0;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

function sortValue(rec: Recurring, key: RecurringSortKey): string | number {
  switch (key) {
    case "type":
      return rec.class?.type?.name?.trim() || "Sem Tipo";
    case "class":
      return rec.class?.name?.trim() || "Sem Classe";
    case "value":
      return Number(rec.value) || 0;
    case "frequency":
      return rec.frequency?.trim() || "";
    case "installments":
      return installmentSortValue(rec);
    case "balance":
      return remainingBalance(rec);
  }
}

export function sortRecurringList(
  list: Recurring[],
  sort: RecurringSortState
): Recurring[] {
  const mult = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    let cmp = 0;
    if (typeof va === "number" && typeof vb === "number") {
      cmp = va - vb;
    } else {
      cmp = compareText(String(va), String(vb));
    }
    if (cmp !== 0) return cmp * mult;
    return compareText(
      a.description?.trim() || a.class?.name || "",
      b.description?.trim() || b.class?.name || ""
    );
  });
}

export function toggleRecurringSort(
  current: RecurringSortState,
  key: RecurringSortKey
): RecurringSortState {
  if (current.key === key) {
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: "asc" };
}
