/**
 * Regra de expansão de parcelas e de simulação de compra parcelada — a matemática do dinheiro
 * comprometido do usuário.
 *
 * Este arquivo é a FONTE ÚNICA da regra: as tools da Orb importam daqui e
 * `src/domain/recurring/{installments,projection}.ts` reexportam daqui. Reimplementar qualquer
 * função abaixo criaria uma segunda verdade sobre o dinheiro do usuário, que diverge já no primeiro
 * `due_day > 30` (a parcela cai no último dia do mês, não num dia 31 que não existe) e no
 * arredondamento da última parcela.
 *
 * Vale a regra do diretório (ver o cabeçalho de `types.ts`): nada de import externo, nada de API de
 * runtime. Só `Date` e aritmética, que existem igual no Deno da Edge, no Node do MCP e no browser.
 */

/** Vencimento de uma parcela: número (1-based) e data civil em `YYYY-MM-DD`. */
export interface InstallmentDue {
  number: number;
  dueDate: string;
}

/** Mês de calendário. `month` é 1–12 (não o 0–11 do `Date`). */
export type YearMonth = { year: number; month: number };

/**
 * Vencimento da parcela `installmentNumber` de um parcelamento mensal.
 *
 * O `Math.min(dueDay, lastDay)` é o ponto que não pode ser reescrito de cabeça: `due_day = 31` em
 * fevereiro vira dia 28 (ou 29), não "1 de março". Um `Date` construído com dia 31 num mês de 30
 * transborda para o mês seguinte e desloca a parcela inteira.
 *
 * A data é montada e lida em horário LOCAL nos dois pontos (`new Date(y, m, d)` +
 * `toIsoDateLocal`), então o ano/mês/dia sobrevivem igual em UTC (Edge) e no fuso da máquina (MCP,
 * browser). O `T12:00:00` na leitura de `startDate` evita que horário de verão jogue a data para o
 * dia anterior.
 */
export function getInstallmentDueDate(
  startDate: string,
  dueDay: number,
  installmentNumber: number
): Date {
  const start = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  const monthOffset = installmentNumber - 1;
  const targetMonth = start.getMonth() + monthOffset;
  const targetYear = start.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const day = Math.min(dueDay, lastDay);
  return new Date(targetYear, normalizedMonth, day);
}

/** Parcela anual: mesmo mês/dia, avançando 1 ano por número. */
export function getAnnualInstallmentDueDate(
  startDate: string,
  dueDay: number,
  installmentNumber: number
): Date {
  const start = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  const targetYear = start.getFullYear() + (installmentNumber - 1);
  const month = start.getMonth();
  const lastDay = new Date(targetYear, month + 1, 0).getDate();
  const day = Math.min(dueDay, lastDay);
  return new Date(targetYear, month, day);
}

/** `YYYY-MM-DD` do `Date` lido em horário local — par obrigatório de `getInstallmentDueDate`. */
export function toIsoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Data em que o parcelamento começa a contar: a informada ou, na falta, a de criação. */
export function resolvePaymentStartDate(rec: {
  payment_start_date: string | null;
  created_at: string;
}): string {
  return rec.payment_start_date?.slice(0, 10) || rec.created_at.slice(0, 10);
}

/**
 * Expande uma recorrência na lista de vencimentos das suas parcelas.
 *
 * `null` significa "isto não é um parcelamento" (recorrência aberta, sem contagem de parcelas nem
 * validade) — quem chama decide o que fazer com isso. Lista VAZIA é diferente: é um plano cuja
 * validade já passou antes da primeira parcela.
 *
 * O segundo ramo é o formato legado (sem `installment_count`, só `validity`): uma parcela por mês
 * do início até a validade, com o dia de vencimento tirado da própria validade.
 */
export function calculateInstallmentDueDates(
  startDate: string,
  dueDay: number | null,
  installmentCount: number | null,
  validity: string | null = null,
  frequency: string | null = null
): InstallmentDue[] | null {
  if (installmentCount && installmentCount > 0 && dueDay) {
    const dues: InstallmentDue[] = [];
    const annual = frequency === "Anual";

    for (let i = 1; i <= installmentCount; i++) {
      const dueDate = annual
        ? getAnnualInstallmentDueDate(startDate, dueDay, i)
        : getInstallmentDueDate(startDate, dueDay, i);
      dues.push({ number: i, dueDate: toIsoDateLocal(dueDate) });
    }

    return dues;
  }

  if (!validity) return null;

  const createdDate = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  const validityDate = new Date(`${validity.slice(0, 10)}T12:00:00`);
  const legacyDueDay = validityDate.getDate();
  const dues: InstallmentDue[] = [];
  const currentDate = new Date(createdDate);

  while (currentDate <= validityDate) {
    const installmentNumber = dues.length + 1;
    const dueDate = getInstallmentDueDate(startDate, legacyDueDay, installmentNumber);
    dues.push({ number: installmentNumber, dueDate: toIsoDateLocal(dueDate) });
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return dues;
}

/** `YYYY-MM` de um mês de calendário. */
export function formatYm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Anda `delta` meses (aceita negativo) sem passar por `Date`, então não tem fuso envolvido. */
export function shiftYearMonth(ym: YearMonth, delta: number): YearMonth {
  const idx = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Ordena meses de calendário: negativo se `a` vem antes de `b`. */
export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
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
 * Divide o total em N parcelas mensais a partir de `start`; a última absorve o arredondamento —
 * é o que faz a soma das parcelas bater com o total em vez de sobrar centavo.
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
    const month = shiftYearMonth(input.start, i);
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
    end: shiftYearMonth(input.start, count - 1),
    byYm,
  };
}

/** Quanto a simulação pesa num mês específico (0 quando a compra não cai nele). */
export function simulationAmountForYm(
  simulation: PurchaseSimulation | null | undefined,
  year: number,
  month: number
): number {
  if (!simulation) return 0;
  return simulation.byYm[formatYm(year, month)] ?? 0;
}
