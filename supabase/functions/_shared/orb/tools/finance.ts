/** Tools de financas da Orb - leitura + simulacao, nunca escrita (P0 da feature 098). */

import type { OrbTool, OrbToolContext } from "../types.ts";
import {
  bool,
  clampLimit,
  exclusiveEnd,
  ilikePattern,
  isoDate,
  limitInfo,
  money,
  monthEnd,
  monthStart,
  monthsAgoRange,
  num,
  paginate,
  str,
  unwrap,
} from "../helpers.ts";
import {
  buildPurchaseSimulation,
  calculateInstallmentDueDates,
  formatYm,
  resolvePaymentStartDate,
  shiftYearMonth,
  simulationAmountForYm,
} from "../recurring.ts";
import type { YearMonth } from "../recurring.ts";

const LEDGER_SELECT =
  "id, value, description, transaction_at, installment_number, class:class_id(id, name, type:type_id(name, exclude_from_spend, nature:nature_id(name)))";

interface LedgerRow {
  id: number;
  value: number;
  description: string | null;
  transaction_at: string;
  installment_number: number | null;
  class: {
    id: number;
    name: string;
    type: {
      name: string;
      exclude_from_spend: boolean | null;
      nature: { name: string } | null;
    } | null;
  } | null;
}

/** Qualquer linha que traga a árvore `class → type → nature` — extrato ou recorrência. */
type ClassifiedRow = { class: LedgerRow["class"] };

function natureOf(row: ClassifiedRow): string {
  return row.class?.type?.nature?.name ?? "Desconhecida";
}

/**
 * A linha conta no gasto do mês? Mesma regra de `countsAsMonthlySpend`
 * (`src/domain/finance/spendFlags.ts`): só natureza Despesa, e só quando o tipo não está marcado
 * como `exclude_from_spend` (transferência entre contas, por exemplo).
 */
function countsAsSpend(row: ClassifiedRow): boolean {
  return natureOf(row) === "Despesa" && !row.class?.type?.exclude_from_spend;
}

/**
 * Lê o extrato do período em páginas. `endDate` é inclusivo para quem chama — a conversão para
 * fronteira exclusiva é feita aqui, uma vez só.
 *
 * O desempate por `id` não é decoração: `transaction_at` repete muito (vários lançamentos no mesmo
 * dia), e sem uma segunda chave estável o Postgres pode devolver a mesma linha em duas páginas e
 * omitir outra, inflando ou furando o total.
 */
async function fetchLedger(
  ctx: OrbToolContext,
  startDate: string,
  endDate: string
): Promise<{ rows: LedgerRow[]; truncated: boolean }> {
  return paginate<LedgerRow>(
    (from, to) =>
      ctx.db
        .from("transaction")
        .select(LEDGER_SELECT)
        .eq("user_id", ctx.userId)
        .gte("transaction_at", startDate)
        .lt("transaction_at", exclusiveEnd(endDate))
        .order("transaction_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    "as transações"
  );
}

/**
 * Campos a espalhar no retorno quando a leitura bateu o teto de linhas. Sem eles a tool soma só o
 * que coube e a Orb apresenta um total parcial com cara de exato — o pior modo de falha possível
 * numa resposta sobre dinheiro.
 */
function truncationNote(truncated: boolean): Record<string, unknown> {
  if (!truncated) return {};
  return {
    truncated: true,
    truncated_warning:
      "O período tem mais transações do que o teto de leitura, então só parte delas entrou nestas somas. Os totais são PARCIAIS: avise o usuário e refaça a consulta com um período menor.",
  };
}

export const queryBudgetStatus: OrbTool = {
  name: "query_budget_status",
  title: "Orçamento do mês",
  description:
    "Situação do orçamento do usuário num mês: quanto foi planejado, quanto já foi gasto, quanto sobra e o status (OK/ATENÇÃO/ESTOUROU) por categoria. Use para perguntas como 'tenho algum orçamento estourado?' ou 'quanto ainda posso gastar com X?'.",
  inputSchema: {
    type: "object",
    properties: {
      month: {
        type: "string",
        description: "Mês no formato YYYY-MM. Omita para usar o mês corrente.",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const budgetMonth = monthStart(input, "month", ctx.today);
    const result = await ctx.db
      .from("vw_monthly_budget_summary")
      .select(
        "type_name, class_name, nature_name, budget_month, planned_value, spent_value, remaining_value, percentage_used, status"
      )
      .eq("user_id", ctx.userId)
      .eq("budget_month", budgetMonth);
    const rows = unwrap<Record<string, unknown>[]>(result, "o orçamento");
    return { month: budgetMonth.slice(0, 7), budgets: rows };
  },
};

export const querySpendByCategory: OrbTool = {
  name: "query_spend_by_category",
  title: "Gastos por categoria",
  description:
    "Totais de receita e despesa do usuário num período, agrupados por categoria (tipo) e subcategoria (classe). Use para 'quanto gastei com fast-food?', 'onde meu dinheiro foi esse mês', 'quais gastos posso cortar'.",
  inputSchema: {
    type: "object",
    properties: {
      start_date: { type: "string", description: "Início do período em YYYY-MM-DD." },
      end_date: { type: "string", description: "Fim do período em YYYY-MM-DD (inclusive)." },
      month: {
        type: "string",
        description:
          "Atalho: mês YYYY-MM. Ignorado se start_date/end_date vierem. Omitir os três usa o mês corrente.",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    let startDate = isoDate(input, "start_date");
    let endDate = isoDate(input, "end_date");
    if (!startDate || !endDate) {
      const first = monthStart(input, "month", ctx.today);
      startDate = startDate ?? first;
      endDate = endDate ?? monthEnd(first);
    }

    const ledger = await fetchLedger(ctx, startDate, endDate);
    const byClass = new Map<
      string,
      { type: string; category: string; nature: string; total: number; count: number }
    >();
    let totalIncome = 0;
    let totalExpense = 0;

    for (const row of ledger.rows) {
      const nature = natureOf(row);
      const typeName = row.class?.type?.name ?? "Sem tipo";
      const className = row.class?.name ?? "Sem categoria";
      const key = `${typeName} > ${className}`;
      const amount = Math.abs(Number(row.value) || 0);

      if (nature === "Receita") totalIncome += amount;
      else if (nature === "Despesa" && !row.class?.type?.exclude_from_spend) totalExpense += amount;

      const bucket = byClass.get(key) ?? {
        type: typeName,
        category: className,
        nature,
        total: 0,
        count: 0,
      };
      bucket.total += amount;
      bucket.count += 1;
      byClass.set(key, bucket);
    }

    const breakdown = [...byClass.values()]
      .map((item) => ({ ...item, total: money(item.total) }))
      .sort((a, b) => b.total - a.total);

    return {
      ...truncationNote(ledger.truncated),
      start_date: startDate,
      end_date: endDate,
      total_income: money(totalIncome),
      total_expense: money(totalExpense),
      balance: money(totalIncome - totalExpense),
      transaction_count: ledger.rows.length,
      breakdown,
    };
  },
};

export const queryTransactions: OrbTool = {
  name: "query_transactions",
  title: "Lançamentos",
  description:
    "Lista as transações do usuário num período, opcionalmente filtradas por texto na descrição. Use quando a pergunta for sobre lançamentos específicos, e não sobre totais.",
  inputSchema: {
    type: "object",
    properties: {
      start_date: { type: "string", description: "Início do período em YYYY-MM-DD." },
      end_date: { type: "string", description: "Fim do período em YYYY-MM-DD (inclusive)." },
      search: { type: "string", description: "Texto a procurar na descrição do lançamento." },
      limit: { type: "number", description: "Máximo de linhas (1 a 100, padrão 30)." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    // Sem período no input o padrão é o mês corrente inteiro. O `{}` no lugar de `input` é
    // proposital: esta tool não aceita `month`, então o mês vem sempre de `ctx.today`.
    const currentMonthStart = monthStart({}, "month", ctx.today);
    const startDate = isoDate(input, "start_date") ?? currentMonthStart;
    const endDate = isoDate(input, "end_date") ?? monthEnd(currentMonthStart);
    const search = str(input, "search");
    const limit = clampLimit(num(input, "limit"), 30, 100);

    let query = ctx.db
      .from("transaction")
      .select(LEDGER_SELECT)
      .eq("user_id", ctx.userId)
      .gte("transaction_at", startDate)
      .lt("transaction_at", exclusiveEnd(endDate));
    if (search) query = query.ilike("description", ilikePattern(search));

    const result = await query.order("transaction_at", { ascending: false }).limit(limit);
    const rows = unwrap<LedgerRow[]>(result, "as transações");

    return {
      start_date: startDate,
      end_date: endDate,
      ...limitInfo(rows.length, limit, "lançamentos"),
      count: rows.length,
      transactions: rows.map((row) => ({
        id: row.id,
        date: row.transaction_at,
        description: row.description,
        value: money(Number(row.value) || 0),
        category: row.class?.name ?? null,
        type: row.class?.type?.name ?? null,
        nature: natureOf(row),
        installment_number: row.installment_number,
      })),
    };
  },
};

interface RecurringRow {
  id: string;
  value: number;
  description: string;
  frequency: string;
  validity: string | null;
  due_day: number | null;
  installment_count: number | null;
  payment_start_date: string | null;
  status: boolean;
  paid_parcels: number[] | null;
  link_url: string | null;
  class: { name: string; type: { name: string; nature: { name: string } | null } | null } | null;
}

export const queryRecurring: OrbTool = {
  name: "query_recurring",
  title: "Recorrências e parcelas",
  description:
    "Recorrências e parcelamentos do usuário (assinaturas, financiamentos, mensalidades), com quantas parcelas já foram pagas e quantas faltam. Use para 'quantas parcelas faltam do meu celular?' ou 'quanto tenho de despesa fixa por mês?'.",
  inputSchema: {
    type: "object",
    properties: {
      only_active: {
        type: "boolean",
        description: "true (padrão) devolve só as recorrências ativas.",
      },
      search: { type: "string", description: "Texto a procurar na descrição da recorrência." },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const search = str(input, "search");
    let query = ctx.db
      .from("recurring_transaction")
      .select(
        "id, value, description, frequency, validity, due_day, installment_count, payment_start_date, status, paid_parcels, link_url, class:class_id(name, type:type_id(name, nature:nature_id(name)))"
      )
      .eq("user_id", ctx.userId);
    if (bool(input, "only_active") !== false) query = query.eq("status", true);
    if (search) query = query.ilike("description", ilikePattern(search));

    const rows = unwrap<RecurringRow[]>(await query, "as recorrências");

    return {
      recurring: rows.map((row) => {
        const paid = (row.paid_parcels ?? []).length;
        const total = row.installment_count ?? null;
        return {
          id: row.id,
          description: row.description,
          value: money(Number(row.value) || 0),
          frequency: row.frequency,
          due_day: row.due_day,
          category: row.class?.name ?? null,
          nature: row.class?.type?.nature?.name ?? null,
          active: row.status,
          installments_total: total,
          installments_paid: paid,
          installments_remaining: total === null ? null : Math.max(0, total - paid),
          payment_start_date: row.payment_start_date,
          validity: row.validity,
          // Feature 206: é o que responde "onde eu pago a luz?". A chave existe sempre, com
          // `null` quando não há link — campo que desaparece o modelo lê como "não sei".
          link_url: row.link_url ?? null,
        };
      }),
    };
  },
};

export const simulateInstallmentImpact: OrbTool = {
  name: "simulate_installment_impact",
  title: "Simulação de parcelamento",
  description:
    "Simula o impacto de uma compra parcelada no orçamento mensal: valor da parcela e comparação com a média de despesa e receita dos últimos meses. NAO grava nada, é só cálculo. Use para 'posso parcelar uma compra de R$5000 em 12x?'.",
  inputSchema: {
    type: "object",
    properties: {
      total_value: { type: "number", description: "Valor total da compra, em reais." },
      installment_count: { type: "number", description: "Número de parcelas (1 a 120)." },
      months_of_history: {
        type: "number",
        description:
          "Quantos meses de calendário já fechados usar como base da média (1 a 12, padrão 3). O mês corrente, que está pela metade, nunca entra na conta.",
      },
    },
    required: ["total_value", "installment_count"],
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const totalValue = num(input, "total_value") ?? 0;
    const installmentCount = clampLimit(num(input, "installment_count"), 1, 120);
    const monthsOfHistory = clampLimit(num(input, "months_of_history"), 3, 12);

    // Meses de calendário fechados, não os últimos 30×N dias: com janela deslizante uma despesa
    // fixa cai 2 ou 3 vezes dentro dela conforme o dia da pergunta, e a média muda sozinha entre
    // duas perguntas idênticas. `history.months` é o divisor real, já clampeado em 1..12.
    const history = monthsAgoRange(ctx.today, monthsOfHistory);
    const ledger = await fetchLedger(ctx, history.start, history.end);

    let income = 0;
    let expense = 0;
    for (const row of ledger.rows) {
      const nature = natureOf(row);
      const amount = Math.abs(Number(row.value) || 0);
      if (nature === "Receita") income += amount;
      else if (nature === "Despesa" && !row.class?.type?.exclude_from_spend) expense += amount;
    }

    const monthlyIncome = money(income / history.months);
    const monthlyExpense = money(expense / history.months);
    const installmentValue = money(totalValue / installmentCount);
    const currentBalance = money(monthlyIncome - monthlyExpense);

    return {
      ...truncationNote(ledger.truncated),
      total_value: money(totalValue),
      installment_count: installmentCount,
      installment_value: installmentValue,
      history_months: history.months,
      history_start_date: history.start,
      history_end_date: history.end,
      average_monthly_income: monthlyIncome,
      average_monthly_expense: monthlyExpense,
      average_monthly_balance: currentBalance,
      balance_after_installment: money(currentBalance - installmentValue),
      installment_share_of_income:
        monthlyIncome > 0 ? money((installmentValue / monthlyIncome) * 100) : null,
    };
  },
};

export const queryFinanceCategories: OrbTool = {
  name: "query_finance_categories",
  title: "Categorias financeiras",
  description:
    "Árvore de categorias financeiras do usuário: natureza (Receita/Despesa/Investimento), tipo e classe. Use ANTES de afirmar que uma categoria existe, e para descobrir o nome exato que o usuário usa.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  run: async (_input, ctx) => {
    const result = await ctx.db
      .from("class")
      .select("id, name, type:type_id(id, name, exclude_from_spend, nature:nature_id(name))")
      .eq("user_id", ctx.userId)
      .order("name", { ascending: true });
    const rows = unwrap<
      {
        id: number;
        name: string;
        type: {
          id: number;
          name: string;
          exclude_from_spend: boolean | null;
          nature: { name: string } | null;
        } | null;
      }[]
    >(result, "as categorias");

    return {
      categories: rows.map((row) => ({
        class_id: row.id,
        class_name: row.name,
        type_name: row.type?.name ?? null,
        nature: row.type?.nature?.name ?? null,
        excluded_from_spend: row.type?.exclude_from_spend ?? false,
      })),
    };
  },
};

/* ── 2T.5 · histórico mensal ─────────────────────────────────────────────────────────────────── */

/** Teto de leitura da view mensal: 20 anos de meses. A série devolvida é bem menor (24 no máximo). */
const MAX_MONTHLY_HISTORY_ROWS = 240;

interface MonthlyHistoryRow {
  year: number | string | null;
  month: number | string | null;
  receita_total: number | string | null;
  despesa_total: number | string | null;
}

interface MonthlyHistoryPoint {
  ym: string;
  year: number;
  month: number;
  total_income: number;
  total_expense: number;
  balance: number;
  income_change_percent: number | null;
  expense_change_percent: number | null;
  has_data: boolean;
  partial: boolean;
}

/**
 * Variação percentual de um mês para o outro.
 *
 * `null` quando não há base: mês anterior zerado (dividir por zero) ou algum dos dois meses sem
 * linha na view. Esse segundo caso importa — mês sem lançamento nenhum simplesmente não existe na
 * view, e tratá-lo como zero faria a Orb afirmar "você gastou 100% menos em junho" quando a verdade
 * é "não há junho". Os totais continuam saindo, com `has_data` dizendo o que eles valem.
 */
function changePercent(
  previous: { value: number; hasData: boolean } | undefined,
  current: number,
  currentHasData: boolean
): number | null {
  if (previous === undefined || !previous.hasData || !currentHasData) return null;
  if (previous.value === 0) return null;
  return money(((current - previous.value) / previous.value) * 100);
}

export const queryMonthlyHistory: OrbTool = {
  name: "query_monthly_history",
  title: "Histórico mensal",
  description:
    "Série mês a mês de receita, despesa e saldo do usuário, com a variação percentual de um mês para o anterior. Use para toda pergunta de comparação no tempo: 'gastei mais que mês passado?', 'minha despesa está subindo?', 'como foi meu saldo nos últimos 6 meses?'. UMA chamada devolve todos os meses — nunca chame query_spend_by_category várias vezes para montar essa comparação. Para saber EM QUE o dinheiro foi num mês específico, aí sim use query_spend_by_category.",
  inputSchema: {
    type: "object",
    properties: {
      months: {
        type: "number",
        description:
          "Quantos meses a série deve ter, terminando no mês corrente (1 a 24, padrão 6). Ex.: 2 compara o mês corrente com o anterior.",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const months = clampLimit(num(input, "months"), 6, 24);

    // A view `vw_value_by_nature_year_month` NÃO tem coluna `user_id` — ela agrega por ano/mês
    // (grupo (c) do cabeçalho de `types.ts`). Um `.eq("user_id", …)` aqui daria 42703 em runtime,
    // que o `catch` do registry engole e chega ao usuário como "não consegui consultar". A view é
    // `security_invoker`: o RLS de `transaction` já filtra pelo dono.
    const result = await ctx.db
      .from("vw_value_by_nature_year_month")
      .select("year, month, receita_total, despesa_total")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(MAX_MONTHLY_HISTORY_ROWS);
    const rows = unwrap<MonthlyHistoryRow[]>(result, "o histórico mensal");

    const byYm = new Map<string, { income: number; expense: number }>();
    for (const row of rows) {
      const year = Number(row.year);
      const month = Number(row.month);
      if (!Number.isFinite(year) || !Number.isFinite(month)) continue;
      byYm.set(formatYm(year, month), {
        income: Number(row.receita_total) || 0,
        expense: Number(row.despesa_total) || 0,
      });
    }

    const current: YearMonth = {
      year: Number(ctx.today.slice(0, 4)),
      month: Number(ctx.today.slice(5, 7)),
    };

    // Meses sem lançamento NÃO aparecem na view. Montar a janela pelo calendário (e não pelas linhas
    // que voltaram) é o que impede a série de pular de julho para maio como se fossem consecutivos.
    const series: MonthlyHistoryPoint[] = [];
    let previousIncome: { value: number; hasData: boolean } | undefined;
    let previousExpense: { value: number; hasData: boolean } | undefined;
    for (let offset = months - 1; offset >= 0; offset--) {
      const point = shiftYearMonth(current, -offset);
      const key = formatYm(point.year, point.month);
      const found = byYm.get(key);
      const hasData = found !== undefined;
      const income = money(found?.income ?? 0);
      const expense = money(found?.expense ?? 0);
      series.push({
        ym: key,
        year: point.year,
        month: point.month,
        total_income: income,
        total_expense: expense,
        balance: money(income - expense),
        income_change_percent: changePercent(previousIncome, income, hasData),
        expense_change_percent: changePercent(previousExpense, expense, hasData),
        has_data: hasData,
        partial: offset === 0,
      });
      previousIncome = { value: income, hasData };
      previousExpense = { value: expense, hasData };
    }

    const closed = series.filter((point) => !point.partial);
    const closedIncome = closed.reduce((sum, point) => sum + point.total_income, 0);
    const closedExpense = closed.reduce((sum, point) => sum + point.total_expense, 0);

    return {
      months_returned: series.length,
      // As médias dividem pelos meses de CALENDÁRIO fechados, não pelos que têm dado — é a mesma
      // convenção de `monthsAgoRange`. `closed_months_with_data` denuncia a janela furada.
      closed_months: closed.length,
      closed_months_with_data: closed.filter((point) => point.has_data).length,
      current_month: formatYm(current.year, current.month),
      partial_month_warning:
        "A última linha da série é o mês corrente, que ainda não fechou: os totais dela são PARCIAIS e não podem ser comparados de igual para igual com um mês inteiro. Diga isso ao usuário ao comparar.",
      average_monthly_income: closed.length > 0 ? money(closedIncome / closed.length) : null,
      average_monthly_expense: closed.length > 0 ? money(closedExpense / closed.length) : null,
      average_monthly_balance:
        closed.length > 0 ? money((closedIncome - closedExpense) / closed.length) : null,
      series,
    };
  },
};

/* ── Leituras compartilhadas pelas simulações (2T.8 e 2T.10) ─────────────────────────────────── */

/**
 * Mesmo extrato do `LEDGER_SELECT`, mais `recurring_transaction_id`: é ele que diz se o lançamento
 * liquidou uma parcela (gasto comprometido) ou foi avulso. Sem essa coluna não dá para separar o
 * que o usuário PODE cortar do que ele já assinou.
 */
const ALLOCATED_LEDGER_SELECT =
  "id, value, transaction_at, recurring_transaction_id, class:class_id(id, name, type:type_id(name, exclude_from_spend, nature:nature_id(name)))";

interface AllocatedLedgerRow {
  id: number;
  value: number;
  transaction_at: string;
  recurring_transaction_id: string | null;
  class: LedgerRow["class"];
}

async function fetchAllocatedLedger(
  ctx: OrbToolContext,
  startDate: string,
  endDate: string
): Promise<{ rows: AllocatedLedgerRow[]; truncated: boolean }> {
  return paginate<AllocatedLedgerRow>(
    (from, to) =>
      ctx.db
        .from("transaction")
        .select(ALLOCATED_LEDGER_SELECT)
        .eq("user_id", ctx.userId)
        .gte("transaction_at", startDate)
        .lt("transaction_at", exclusiveEnd(endDate))
        .order("transaction_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    "as transações"
  );
}

const ACTIVE_RECURRING_SELECT =
  "id, value, description, frequency, validity, due_day, installment_count, payment_start_date, created_at, paid_parcels, class_id, class:class_id(id, name, type:type_id(name, exclude_from_spend, nature:nature_id(name)))";

/** Teto de recorrências lidas — ninguém tem 400 assinaturas ativas, mas o teto é obrigatório. */
const MAX_ACTIVE_RECURRING_ROWS = 400;

/** Teto de parcelas expandidas por recorrência: um `installment_count` absurdo travaria o isolate. */
const MAX_EXPANDED_INSTALLMENTS = 600;

interface ActiveRecurringRow {
  id: string;
  value: number;
  description: string | null;
  frequency: string | null;
  validity: string | null;
  due_day: number | null;
  installment_count: number | null;
  payment_start_date: string | null;
  created_at: string | null;
  class_id: number | null;
  class: LedgerRow["class"];
}

async function fetchActiveRecurring(ctx: OrbToolContext): Promise<ActiveRecurringRow[]> {
  return unwrap<ActiveRecurringRow[]>(
    await ctx.db
      .from("recurring_transaction")
      .select(ACTIVE_RECURRING_SELECT)
      .eq("user_id", ctx.userId)
      .eq("status", true)
      .limit(MAX_ACTIVE_RECURRING_ROWS),
    "as recorrências"
  );
}

/* ── 2T.8 · onde cortar gasto ────────────────────────────────────────────────────────────────── */

interface CutBucket {
  classId: number | null;
  type: string;
  category: string;
  total: number;
  committed: number;
  months: Set<string>;
  count: number;
}

interface CutClass {
  class_id: number | null;
  type: string;
  category: string;
  total: number;
  monthly_average: number;
  committed_monthly: number;
  discretionary_monthly: number;
  commitment: "comprometido" | "parcial" | "discricionario";
  has_active_recurring: boolean;
  active_recurring_count: number;
  active_recurring_examples: string[];
  months_with_activity: number;
  transaction_count: number;
}

export const simulateBudgetCut: OrbTool = {
  name: "simulate_budget_cut",
  title: "Onde cortar gasto",
  description:
    "Onde o usuário pode cortar para sobrar mais dinheiro no fim do mês. Devolve, por categoria, quanto ele gasta em média por mês, em quantos dos meses analisados houve lançamento (months_with_activity, que separa gasto mensal de sazonal como IPVA ou viagem) e se o gasto é COMPROMETIDO (tem parcelamento ou recorrência ativa — cortar não é opção, é inadimplência) ou DISCRICIONÁRIO. NAO grava nada, é só cálculo. Use para 'quais gastos posso diminuir para ter um saldo 10% maior no mês que vem?', 'onde dá pra economizar R$500 por mês?', 'o que está pesando no meu orçamento?'.",
  inputSchema: {
    type: "object",
    properties: {
      target_increase_percent: {
        type: "number",
        description:
          "Quanto maior o usuário quer o saldo mensal, em % (ex.: 10 para 'um saldo 10% maior'). Padrão 10. Ignorado quando target_amount vem.",
      },
      target_amount: {
        type: "number",
        description:
          "Quanto o usuário quer economizar por mês, em reais. Tem prioridade sobre target_increase_percent. Use quando ele disser um valor ('preciso sobrar R$500').",
      },
      months_of_history: {
        type: "number",
        description:
          "Quantos meses de calendário já fechados usar como base (1 a 12, padrão 3). Meses maiores relativizam sazonalidade; o mês corrente, pela metade, nunca entra.",
      },
      limit: {
        type: "number",
        description:
          "Quantas categorias devolver, das que mais pesam para as que menos pesam (1 a 30, padrão 12).",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const monthsOfHistory = clampLimit(num(input, "months_of_history"), 3, 12);
    const limit = clampLimit(num(input, "limit"), 12, 30);
    const targetAmount = num(input, "target_amount");
    const increasePercent = num(input, "target_increase_percent") ?? 10;

    const history = monthsAgoRange(ctx.today, monthsOfHistory);
    const [ledger, recurring] = await Promise.all([
      fetchAllocatedLedger(ctx, history.start, history.end),
      fetchActiveRecurring(ctx),
    ]);

    // Classe com recorrência ATIVA é compromisso assumido. Guardar as descrições deixa a Orb nomear
    // o compromisso ("o financiamento do carro") em vez de falar de uma categoria abstrata — e é o
    // que impede a resposta de sugerir cortar justamente o que não dá para cortar.
    const commitmentByClass = new Map<number, { count: number; descriptions: string[] }>();
    for (const row of recurring) {
      if (!countsAsSpend(row)) continue;
      const classId = Number(row.class_id);
      if (!Number.isFinite(classId)) continue;
      const bucket = commitmentByClass.get(classId) ?? { count: 0, descriptions: [] };
      bucket.count += 1;
      const description = row.description?.trim();
      if (description && bucket.descriptions.length < 3) bucket.descriptions.push(description);
      commitmentByClass.set(classId, bucket);
    }

    const byClass = new Map<string, CutBucket>();
    let income = 0;
    let expense = 0;

    for (const row of ledger.rows) {
      const amount = Math.abs(Number(row.value) || 0);
      if (natureOf(row) === "Receita") {
        income += amount;
        continue;
      }
      if (!countsAsSpend(row)) continue;
      expense += amount;

      const typeName = row.class?.type?.name ?? "Sem tipo";
      const className = row.class?.name ?? "Sem categoria";
      // Agrupa pelo `class_id`, não pelo nome: é o mesmo id usado para casar com a recorrência
      // ativa, e duas chaves diferentes fariam um gasto comprometido aparecer como cortável.
      const key = row.class?.id !== undefined ? `id:${row.class.id}` : `nome:${typeName} > ${className}`;
      const bucket = byClass.get(key) ?? {
        classId: row.class?.id ?? null,
        type: typeName,
        category: className,
        total: 0,
        committed: 0,
        months: new Set<string>(),
        count: 0,
      };
      bucket.total += amount;
      if (row.recurring_transaction_id) bucket.committed += amount;
      bucket.months.add(String(row.transaction_at ?? "").slice(0, 7));
      bucket.count += 1;
      byClass.set(key, bucket);
    }

    const divisor = history.months;
    const classes: CutClass[] = [...byClass.values()].map((bucket) => {
      const commitment =
        bucket.classId !== null ? commitmentByClass.get(bucket.classId) : undefined;
      const committedShare = bucket.total > 0 ? bucket.committed / bucket.total : 0;
      const level: CutClass["commitment"] =
        committedShare >= 0.9
          ? "comprometido"
          : bucket.committed > 0 || commitment !== undefined
            ? "parcial"
            : "discricionario";
      return {
        class_id: bucket.classId,
        type: bucket.type,
        category: bucket.category,
        total: money(bucket.total),
        monthly_average: money(bucket.total / divisor),
        committed_monthly: money(bucket.committed / divisor),
        discretionary_monthly: money((bucket.total - bucket.committed) / divisor),
        commitment: level,
        has_active_recurring: commitment !== undefined,
        active_recurring_count: commitment?.count ?? 0,
        active_recurring_examples: commitment?.descriptions ?? [],
        months_with_activity: bucket.months.size,
        transaction_count: bucket.count,
      };
    });

    const monthlyIncome = money(income / divisor);
    const monthlyExpense = money(expense / divisor);
    const monthlyBalance = money(monthlyIncome - monthlyExpense);

    // Saldo negativo com meta percentual: 10% de um número negativo é um alvo negativo, que faria a
    // Orb dizer "corte R$-80". A base vira o módulo do saldo e o aviso explica a leitura correta.
    const target =
      targetAmount !== undefined
        ? money(Math.abs(targetAmount))
        : money((Math.abs(monthlyBalance) * increasePercent) / 100);

    const committedTotal = money(
      classes.reduce((sum, item) => sum + item.committed_monthly, 0)
    );
    const discretionaryTotal = money(
      classes
        .filter((item) => item.commitment !== "comprometido")
        .reduce((sum, item) => sum + item.discretionary_monthly, 0)
    );

    classes.sort(
      (a, b) =>
        b.discretionary_monthly - a.discretionary_monthly || b.monthly_average - a.monthly_average
    );
    const shown = classes.slice(0, limit).map((item) => ({
      ...item,
      covers_target_percent:
        target > 0 ? money((item.discretionary_monthly / target) * 100) : null,
    }));

    return {
      ...truncationNote(ledger.truncated),
      history_months: divisor,
      history_start_date: history.start,
      history_end_date: history.end,
      average_monthly_income: monthlyIncome,
      average_monthly_expense: monthlyExpense,
      average_monthly_balance: monthlyBalance,
      target_basis: targetAmount !== undefined ? "valor_informado" : "percentual_do_saldo",
      target_increase_percent: targetAmount !== undefined ? null : increasePercent,
      target_monthly_saving: target,
      ...(targetAmount === undefined && monthlyBalance <= 0
        ? {
            target_note:
              "O saldo médio do período é zero ou negativo, então a meta percentual foi calculada sobre o valor absoluto dele. Leia o número como 'quanto precisa sobrar a mais por mês' e avise o usuário de que ele está no vermelho.",
          }
        : {}),
      committed_monthly_total: committedTotal,
      discretionary_monthly_total: discretionaryTotal,
      target_share_of_discretionary_percent:
        discretionaryTotal > 0 ? money((target / discretionaryTotal) * 100) : null,
      feasible_without_touching_committed: discretionaryTotal >= target,
      classes_total: classes.length,
      classes_returned: shown.length,
      classes: shown,
      method:
        "Médias sobre meses de calendário FECHADOS (o corrente, pela metade, fica de fora). committed_monthly vem de lançamentos ligados a uma parcela; has_active_recurring marca a classe que tem recorrência ativa mesmo sem lançamento ligado. Sugira cortes só onde discretionary_monthly for relevante, e antes de tratar uma categoria como gasto mensal confira months_with_activity contra history_months.",
    };
  },
};

/* ── 2T.10 · projeção de saldo mês a mês ─────────────────────────────────────────────────────── */

interface MonthCommitment {
  scheduledIncome: number;
  scheduledExpense: number;
  expenseCount: number;
  lines: { description: string; value: number }[];
}

export const simulateMonthBalance: OrbTool = {
  name: "simulate_month_balance",
  title: "Projeção de saldo mensal",
  description:
    "Projeta o saldo dos próximos meses UM A UM, somando as parcelas e recorrências que realmente vencem em cada mês (não uma média) mais uma compra parcelada hipotética. NAO grava nada. Use para 'quanto vou ficar de saldo se eu parcelar R$5000 em 12x?', 'em que mês eu aperto?', 'cabe mais uma parcela?'. Prefira esta a simulate_installment_impact sempre que o usuário já tiver parcelamentos correndo: a outra compara a parcela nova só contra a média e não enxerga o mês em que quatro parcelas caem juntas. Omitindo total_value ela projeta só a situação atual.",
  inputSchema: {
    type: "object",
    properties: {
      total_value: {
        type: "number",
        description:
          "Valor total da compra hipotética, em reais. Omita para projetar só os compromissos que já existem.",
      },
      installment_count: {
        type: "number",
        description: "Em quantas parcelas a compra hipotética seria dividida (1 a 120, padrão 1).",
      },
      first_installment_month: {
        type: "string",
        description:
          "Mês da primeira parcela da compra, em YYYY-MM. Padrão: o mês corrente. Se cair depois da janela projetada, aumente months.",
      },
      months: {
        type: "number",
        description:
          "Quantos meses projetar a partir do mês corrente (1 a 12, padrão 3). Para uma compra em 12x, use 12 para ver o parcelamento inteiro.",
      },
      months_of_history: {
        type: "number",
        description:
          "Quantos meses de calendário já fechados usar para a média dos gastos avulsos (1 a 12, padrão 3).",
      },
    },
    additionalProperties: false,
  },
  run: async (input, ctx) => {
    const totalValue = num(input, "total_value") ?? 0;
    const installmentCount = clampLimit(num(input, "installment_count"), 1, 120);
    const months = clampLimit(num(input, "months"), 3, 12);
    const monthsOfHistory = clampLimit(num(input, "months_of_history"), 3, 12);

    const current: YearMonth = {
      year: Number(ctx.today.slice(0, 4)),
      month: Number(ctx.today.slice(5, 7)),
    };
    const purchaseStartIso = monthStart(input, "first_installment_month", ctx.today);
    const purchaseStart: YearMonth = {
      year: Number(purchaseStartIso.slice(0, 4)),
      month: Number(purchaseStartIso.slice(5, 7)),
    };

    const history = monthsAgoRange(ctx.today, monthsOfHistory);
    const [ledger, recurring] = await Promise.all([
      fetchAllocatedLedger(ctx, history.start, history.end),
      fetchActiveRecurring(ctx),
    ]);

    // Só os lançamentos AVULSOS viram média. Os que liquidaram parcela já voltam mês a mês pela
    // agenda de recorrências abaixo, e somar os dois contaria o mesmo dinheiro duas vezes — é a
    // mesma separação que `indexAvulsoLedgerByYm` faz em `src/domain/recurring/projection.ts`.
    let extraIncome = 0;
    let extraExpense = 0;
    let totalIncome = 0;
    let totalExpense = 0;
    for (const row of ledger.rows) {
      const isIncome = natureOf(row) === "Receita";
      if (!isIncome && !countsAsSpend(row)) continue;
      const amount = Math.abs(Number(row.value) || 0);
      if (isIncome) totalIncome += amount;
      else totalExpense += amount;
      if (row.recurring_transaction_id) continue;
      if (isIncome) extraIncome += amount;
      else extraExpense += amount;
    }

    const divisor = history.months;
    const averageExtraIncome = money(extraIncome / divisor);
    const averageExtraExpense = money(extraExpense / divisor);

    const windowKeys: string[] = [];
    for (let i = 0; i < months; i++) {
      const point = shiftYearMonth(current, i);
      windowKeys.push(formatYm(point.year, point.month));
    }
    const windowSet = new Set(windowKeys);

    // A regra de vencimento vem de `_shared/orb/recurring.ts`, a mesma que o app usa para desenhar
    // Contas a Pagar. Reimplementar aqui divergiria já no primeiro `due_day > 30`.
    const byMonth = new Map<string, MonthCommitment>();
    let withoutSchedule = 0;
    for (const row of recurring) {
      const isIncome = natureOf(row) === "Receita";
      if (!isIncome && !countsAsSpend(row)) continue;
      if (!row.payment_start_date && !row.created_at) {
        withoutSchedule += 1;
        continue;
      }
      const startDate = resolvePaymentStartDate({
        payment_start_date: row.payment_start_date,
        created_at: row.created_at ?? "",
      });
      if (!startDate) {
        withoutSchedule += 1;
        continue;
      }
      const declared = Number(row.installment_count) || null;
      const dues = calculateInstallmentDueDates(
        startDate,
        row.due_day,
        declared === null ? null : Math.min(declared, MAX_EXPANDED_INSTALLMENTS),
        row.validity,
        row.frequency
      );
      // `null` = recorrência aberta, sem contagem de parcelas nem validade: não dá para agendar.
      // Ela não entra na projeção, e `recurring_without_schedule` avisa o modelo disso.
      if (!dues) {
        withoutSchedule += 1;
        continue;
      }

      const value = Math.abs(Number(row.value) || 0);
      const base = row.description?.trim() || row.class?.name || "Conta";
      for (const due of dues) {
        const key = due.dueDate.slice(0, 7);
        if (!windowSet.has(key)) continue;
        const bucket = byMonth.get(key) ?? {
          scheduledIncome: 0,
          scheduledExpense: 0,
          expenseCount: 0,
          lines: [],
        };
        if (isIncome) {
          bucket.scheduledIncome += value;
        } else {
          bucket.scheduledExpense += value;
          bucket.expenseCount += 1;
          bucket.lines.push({
            description:
              declared !== null && declared > 1 ? `${base} (${due.number}/${declared})` : base,
            value: money(value),
          });
        }
        byMonth.set(key, bucket);
      }
    }

    const simulation = buildPurchaseSimulation({
      total: totalValue,
      installmentCount,
      start: purchaseStart,
    });

    const projected = [];
    let negativeMonths = 0;
    let worst: { ym: string; balance: number } | null = null;

    for (let i = 0; i < months; i++) {
      const point = shiftYearMonth(current, i);
      const key = windowKeys[i];
      const commitment = byMonth.get(key);
      const scheduledIncome = money(commitment?.scheduledIncome ?? 0);
      const scheduledExpense = money(commitment?.scheduledExpense ?? 0);
      const purchase = money(simulationAmountForYm(simulation, point.year, point.month));
      const projectedIncome = money(averageExtraIncome + scheduledIncome);
      const projectedExpense = money(averageExtraExpense + scheduledExpense + purchase);
      const balance = money(projectedIncome - projectedExpense);

      if (balance < 0) negativeMonths += 1;
      if (!worst || balance < worst.balance) worst = { ym: key, balance };

      projected.push({
        ym: key,
        year: point.year,
        month: point.month,
        scheduled_income: scheduledIncome,
        scheduled_expense: scheduledExpense,
        new_purchase_installment: purchase,
        projected_income: projectedIncome,
        projected_expense: projectedExpense,
        balance,
        balance_without_purchase: money(balance + purchase),
        installments_due_count: commitment?.expenseCount ?? 0,
        biggest_commitments: [...(commitment?.lines ?? [])]
          .sort((a, b) => b.value - a.value)
          .slice(0, 3),
      });
    }

    const lastWindowMonth = windowKeys[windowKeys.length - 1];
    const firstInstallmentMonth = simulation
      ? formatYm(simulation.start.year, simulation.start.month)
      : null;

    return {
      ...truncationNote(ledger.truncated),
      total_value: money(totalValue),
      installment_count: simulation ? simulation.installmentCount : null,
      installment_value: simulation ? money(simulation.installmentValue) : null,
      first_installment_month: firstInstallmentMonth,
      last_installment_month: simulation
        ? formatYm(simulation.end.year, simulation.end.month)
        : null,
      purchase_outside_window:
        firstInstallmentMonth !== null && firstInstallmentMonth > lastWindowMonth,
      history_months: divisor,
      history_start_date: history.start,
      history_end_date: history.end,
      average_monthly_income: money(totalIncome / divisor),
      average_monthly_expense: money(totalExpense / divisor),
      average_extra_monthly_income: averageExtraIncome,
      average_extra_monthly_expense: averageExtraExpense,
      active_recurring_count: recurring.length,
      recurring_without_schedule: withoutSchedule,
      months_projected: projected.length,
      months_with_negative_balance: negativeMonths,
      fits_every_month: negativeMonths === 0,
      worst_month: worst,
      months: projected,
      method:
        "Cada mês = média dos lançamentos AVULSOS do histórico (os que liquidaram parcela ficam de fora para o mesmo dinheiro não ser contado duas vezes) + as parcelas e recorrências com vencimento naquele mês + a parcela da compra simulada. O que varia entre os meses é a agenda de parcelas, não a média. recurring_without_schedule conta recorrências ativas sem parcelas calculáveis, que ficaram de fora da projeção.",
    };
  },
};

/**
 * ORDEM: as 6 tools originais primeiro, na ordem original, e as novas SEMPRE no fim — é a regra do
 * cabeçalho de `registry.ts`, e o motivo dela é o breakpoint de prompt caching, que fica na última
 * definição do catálogo. `query_monthly_history`, `simulate_budget_cut` e `simulate_month_balance`
 * chegaram depois e estavam inseridas antes de `query_finance_categories`; corrigido enquanto nada
 * está publicado, porque depois do deploy reordenar custa um cache miss global.
 */
export const financeTools: OrbTool[] = [
  queryBudgetStatus,
  querySpendByCategory,
  queryTransactions,
  queryRecurring,
  simulateInstallmentImpact,
  queryFinanceCategories,
  queryMonthlyHistory,
  simulateBudgetCut,
  simulateMonthBalance,
];
