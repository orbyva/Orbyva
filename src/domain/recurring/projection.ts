import type { Recurring } from "@/types/recurring";
import { countsAsMonthlySpend } from "@/domain/finance/spendFlags";
import { NATURE_RECEITA } from "@/domain/finance/spendFlags";

export type ProjectionNature = "receive" | "pay";

export type ProjectionLine = {
  recurringId: string;
  description: string;
  value: number;
  installmentNumber: number;
  dueDate: string;
  paid: boolean;
  nature: ProjectionNature;
};

/** month = 1–12 */
export type YearMonth = { year: number; month: number };

export type MonthProjection = {
  year: number;
  month: number;
  ym: string;
  receiveLines: ProjectionLine[];
  payLines: ProjectionLine[];
  receiveTotal: number;
  payTotal: number;
  net: number;
};

export type ProjectionSeriesPoint = {
  year: number;
  month: number;
  ym: string;
  receiveTotal: number;
  payTotal: number;
  net: number;
};

/** Totais de lançamentos por mês (já filtrados para gasto mensal). */
export type LedgerMonthAmounts = {
  receita: number;
  despesa: number;
};

export type MonthCashBalance = {
  year: number;
  month: number;
  ym: string;
  /** Totais brutos de lançamentos no mês (podem incluir liquidações de parcela). */
  ledgerReceita: number;
  ledgerDespesa: number;
  /** Parcelas do mês ainda em aberto. */
  openReceive: number;
  openPay: number;
  /** Parcelas do mês (pagas + em aberto), o gasto/receita comprometido. */
  parcelReceive: number;
  parcelPay: number;
  /** Lançamentos avulsos, sem a parte já coberta pelas parcelas pagas do mês. */
  extraReceita: number;
  extraDespesa: number;
  receiveTotal: number;
  payTotal: number;
  net: number;
};

/** Linha de lançamento avulso do ledger (não vinculada a parcela). */
export type LedgerProjectionLine = {
  id: number;
  description: string;
  value: number;
  date: string;
  nature: ProjectionNature;
};

function padMonth(month: number): string {
  return String(month).padStart(2, "0");
}

export function formatYm(year: number, month: number): string {
  return `${year}-${padMonth(month)}`;
}

function dueInMonth(dueDate: string, year: number, month: number): boolean {
  // dueDate is YYYY-MM-DD
  if (dueDate.length < 7) return false;
  return dueDate.slice(0, 7) === formatYm(year, month);
}

function lineDescription(rec: Recurring, installmentNumber: number): string {
  const base = rec.description?.trim() || rec.class?.name || "Conta";
  const count = rec.installment_count;
  if (count != null && count > 1) {
    return `${base} (${installmentNumber}/${count})`;
  }
  return base;
}

/**
 * Planilha Contas a Pagar / A Receber para um mês.
 * Por padrão inclui pagas e em aberto (totais = comprometido).
 * Com `openOnly`, exclui pagas das linhas e dos totais.
 */
export function buildMonthProjection(
  recurringList: Recurring[],
  year: number,
  month: number,
  options: { openOnly?: boolean } = {}
): MonthProjection {
  const receiveLines: ProjectionLine[] = [];
  const payLines: ProjectionLine[] = [];

  for (const rec of recurringList) {
    if (!Array.isArray(rec.installments)) continue;

    const paidParcels = rec.paid_parcels || [];
    const natureName = rec.class?.type?.nature?.name;
    const type = rec.class?.type ?? null;

    for (const installment of rec.installments) {
      if (!dueInMonth(installment.dueDate, year, month)) continue;

      const paid = paidParcels.some(
        (n) => Number(n) === Number(installment.number)
      );
      if (options.openOnly && paid) continue;

      const line: ProjectionLine = {
        recurringId: rec.id,
        description: lineDescription(rec, installment.number),
        value: Number(rec.value) || 0,
        installmentNumber: installment.number,
        dueDate: installment.dueDate,
        paid,
        nature: "pay",
      };

      if (natureName === NATURE_RECEITA) {
        receiveLines.push({ ...line, nature: "receive" });
      } else if (countsAsMonthlySpend(natureName, type)) {
        payLines.push(line);
      }
    }
  }

  receiveLines.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.description.localeCompare(b.description));
  payLines.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.description.localeCompare(b.description));

  const receiveTotal = receiveLines.reduce((s, l) => s + l.value, 0);
  const payTotal = payLines.reduce((s, l) => s + l.value, 0);

  return {
    year,
    month,
    ym: formatYm(year, month),
    receiveLines,
    payLines,
    receiveTotal,
    payTotal,
    net: receiveTotal - payTotal,
  };
}

/** Filtra linhas pagas (útil quando a projeção veio completa). */
export function filterOpenProjectionLines(
  projection: MonthProjection
): Pick<MonthProjection, "receiveLines" | "payLines"> {
  return {
    receiveLines: projection.receiveLines.filter((l) => !l.paid),
    payLines: projection.payLines.filter((l) => !l.paid),
  };
}

function addMonths(ym: YearMonth, delta: number): YearMonth {
  const idx = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

function compareYm(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

export type ProjectionSeriesOptions = {
  openOnly?: boolean;
};

/**
 * Série multi-mês de a receber / a pagar / saldo.
 * `from` e `to` inclusivos (month 1–12).
 */
export function buildProjectionSeries(
  recurringList: Recurring[],
  from: YearMonth,
  to: YearMonth,
  options: ProjectionSeriesOptions = {}
): ProjectionSeriesPoint[] {
  const points: ProjectionSeriesPoint[] = [];
  if (compareYm(from, to) > 0) return points;

  let cursor = from;
  while (compareYm(cursor, to) <= 0) {
    const m = buildMonthProjection(
      recurringList,
      cursor.year,
      cursor.month,
      options
    );
    points.push({
      year: m.year,
      month: m.month,
      ym: m.ym,
      receiveTotal: m.receiveTotal,
      payTotal: m.payTotal,
      net: m.net,
    });
    cursor = addMonths(cursor, 1);
  }
  return points;
}

/** Últimos `months` meses terminando em `end` (default: mês atual). */
export function buildProjectionSeriesTrailing(
  recurringList: Recurring[],
  months = 12,
  end: YearMonth = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  },
  options: ProjectionSeriesOptions = {}
): ProjectionSeriesPoint[] {
  const from = addMonths(end, -(Math.max(1, months) - 1));
  return buildProjectionSeries(recurringList, from, end, options);
}

export type ProjectionSeriesWindowOptions = ProjectionSeriesOptions & {
  /** Meses antes do âncora (default 2). */
  past?: number;
  /** Meses depois do âncora, exclusivos do âncora (default 9 → âncora + 9 à frente). */
  future?: number;
};

/**
 * Janela em torno do mês âncora: passado recente + mês selecionado + futuro.
 * Serve para decidir se cabe um novo compromisso (ex.: financiamento).
 */
export function buildProjectionSeriesWindow(
  recurringList: Recurring[],
  anchor: YearMonth,
  options: ProjectionSeriesWindowOptions = {}
): ProjectionSeriesPoint[] {
  const past = Math.max(0, options.past ?? 2);
  const future = Math.max(0, options.future ?? 9);
  const from = addMonths(anchor, -past);
  const to = addMonths(anchor, future);
  return buildProjectionSeries(recurringList, from, to, {
    openOnly: options.openOnly,
  });
}

export function shiftYearMonth(ym: YearMonth, delta: number): YearMonth {
  return addMonths(ym, delta);
}

export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return compareYm(a, b);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type PurchaseSimulationInput = {
  total: number;
  installmentCount: number;
  start: YearMonth;
};

export type PurchaseSimulation = {
  total: number;
  installmentCount: number;
  /** Valor típico da parcela (antes do ajuste da última). */
  installmentValue: number;
  start: YearMonth;
  end: YearMonth;
  /** Valor da simulação por `yyyy-mm`. */
  byYm: Record<string, number>;
};

/**
 * Simulação what-if de compra parcelada (não persiste).
 * Divide o total em N parcelas mensais a partir de `start`; a última absorve o arredondamento.
 */
export function buildPurchaseSimulation(
  input: PurchaseSimulationInput
): PurchaseSimulation | null {
  const count = Math.floor(input.installmentCount);
  if (!(input.total > 0) || count < 1) return null;

  const base = roundMoney(input.total / count);
  const byYm: Record<string, number> = {};
  let allocated = 0;

  for (let i = 0; i < count; i++) {
    const month = addMonths(input.start, i);
    const isLast = i === count - 1;
    const value = isLast ? roundMoney(input.total - allocated) : base;
    allocated = roundMoney(allocated + value);
    byYm[formatYm(month.year, month.month)] = value;
  }

  return {
    total: input.total,
    installmentCount: count,
    installmentValue: base,
    start: input.start,
    end: addMonths(input.start, count - 1),
    byYm,
  };
}

export function simulationAmountForYm(
  simulation: PurchaseSimulation | null | undefined,
  year: number,
  month: number
): number {
  if (!simulation) return 0;
  return simulation.byYm[formatYm(year, month)] ?? 0;
}

/** Extensão mínima de meses futuros no gráfico para caber a simulação. */
export function futureMonthsForSimulation(
  anchor: YearMonth,
  simulation: PurchaseSimulation | null | undefined,
  baseFuture = 9,
  maxFuture = 23
): number {
  if (!simulation) return baseFuture;
  const needed = compareYm(simulation.end, anchor);
  if (needed <= 0) return baseFuture;
  return Math.min(maxFuture, Math.max(baseFuture, needed));
}

export function indexLedgerByYm(
  rows: Array<{
    year: number;
    month: number;
    receita_total: number;
    despesa_total: number;
  }>
): Record<string, LedgerMonthAmounts> {
  const map: Record<string, LedgerMonthAmounts> = {};
  for (const row of rows) {
    map[formatYm(row.year, row.month)] = {
      receita: Number(row.receita_total) || 0,
      despesa: Number(row.despesa_total) || 0,
    };
  }
  return map;
}

type LedgerTxLike = {
  id: number;
  value: number;
  description: string;
  transaction_at: string;
  recurring_transaction_id?: string | null;
  class?: {
    type?: {
      name?: string;
      exclude_from_spend?: boolean | null;
      nature?: { name?: string | null } | null;
    } | null;
  } | null;
};

/**
 * Soma lançamentos avulsos (sem vínculo com parcela) por mês.
 * Use este mapa no gráfico, já é a fatia “avulsa”, sem liquidação de parcela.
 */
export function indexAvulsoLedgerByYm(
  transactions: LedgerTxLike[]
): Record<string, LedgerMonthAmounts> {
  const map: Record<string, LedgerMonthAmounts> = {};

  for (const tx of transactions) {
    if (tx.recurring_transaction_id) continue;

    const natureName = tx.class?.type?.nature?.name ?? null;
    const type = tx.class?.type ?? null;
    const date = String(tx.transaction_at ?? "").slice(0, 10);
    if (date.length < 7) continue;
    const ym = date.slice(0, 7);
    const value = Math.abs(Number(tx.value) || 0);
    if (value <= 0) continue;

    const bucket = map[ym] ?? { receita: 0, despesa: 0 };

    if (natureName === NATURE_RECEITA) {
      bucket.receita += value;
      map[ym] = bucket;
    } else if (countsAsMonthlySpend(natureName, type)) {
      bucket.despesa += value;
      map[ym] = bucket;
    }
  }

  return map;
}

/**
 * Balanço do mês na projeção:
 * parcelas do mês (pagas + em aberto) + lançamentos avulsos.
 *
 * `ledger` deve ser só a fatia avulsa (sem liquidações de parcela).
 * Parcelas pagas continuam contando via `parcel*`.
 */
export function buildMonthCashBalance(
  recurringList: Recurring[],
  year: number,
  month: number,
  ledger?: LedgerMonthAmounts | null
): MonthCashBalance {
  const committed = buildMonthProjection(recurringList, year, month, {
    openOnly: false,
  });
  const open = buildMonthProjection(recurringList, year, month, {
    openOnly: true,
  });

  const parcelReceive = committed.receiveTotal;
  const parcelPay = committed.payTotal;
  const extraReceita = Number(ledger?.receita) || 0;
  const extraDespesa = Number(ledger?.despesa) || 0;

  const receiveTotal = parcelReceive + extraReceita;
  const payTotal = parcelPay + extraDespesa;

  return {
    year,
    month,
    ym: formatYm(year, month),
    ledgerReceita: extraReceita,
    ledgerDespesa: extraDespesa,
    openReceive: open.receiveTotal,
    openPay: open.payTotal,
    parcelReceive,
    parcelPay,
    extraReceita,
    extraDespesa,
    receiveTotal,
    payTotal,
    net: receiveTotal - payTotal,
  };
}

/**
 * Série da janela com balanço (parcelas do mês + lançamentos avulsos).
 * Com `openOnly`, mantém só parcelas em aberto (sem lançamentos).
 */
export function buildBalanceSeriesWindow(
  recurringList: Recurring[],
  anchor: YearMonth,
  ledgerByYm: Record<string, LedgerMonthAmounts> = {},
  options: ProjectionSeriesWindowOptions = {}
): ProjectionSeriesPoint[] {
  const past = Math.max(0, options.past ?? 2);
  const future = Math.max(0, options.future ?? 9);
  const from = addMonths(anchor, -past);
  const to = addMonths(anchor, future);

  if (options.openOnly) {
    return buildProjectionSeries(recurringList, from, to, { openOnly: true });
  }

  const points: ProjectionSeriesPoint[] = [];
  let cursor = from;
  while (compareYm(cursor, to) <= 0) {
    const balance = buildMonthCashBalance(
      recurringList,
      cursor.year,
      cursor.month,
      ledgerByYm[formatYm(cursor.year, cursor.month)]
    );
    points.push({
      year: balance.year,
      month: balance.month,
      ym: balance.ym,
      receiveTotal: balance.receiveTotal,
      payTotal: balance.payTotal,
      net: balance.net,
    });
    cursor = addMonths(cursor, 1);
  }
  return points;
}

/** Lançamentos avulsos do mês (ignora os gerados por parcela). */
export function ledgerTransactionsToLines(transactions: LedgerTxLike[]): {
  receiveLines: LedgerProjectionLine[];
  payLines: LedgerProjectionLine[];
} {
  const receiveLines: LedgerProjectionLine[] = [];
  const payLines: LedgerProjectionLine[] = [];

  for (const tx of transactions) {
    if (tx.recurring_transaction_id) continue;

    const natureName = tx.class?.type?.nature?.name ?? null;
    const type = tx.class?.type ?? null;
    const date = tx.transaction_at.slice(0, 10);
    const line: LedgerProjectionLine = {
      id: tx.id,
      description: tx.description?.trim() || "Lançamento",
      value: Number(tx.value) || 0,
      date,
      nature: "pay",
    };

    if (natureName === NATURE_RECEITA) {
      receiveLines.push({ ...line, nature: "receive" });
    } else if (countsAsMonthlySpend(natureName, type)) {
      payLines.push(line);
    }
  }

  receiveLines.sort(
    (a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description)
  );
  payLines.sort(
    (a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description)
  );

  return { receiveLines, payLines };
}
