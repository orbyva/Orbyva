import type { SupabaseClient } from "@supabase/supabase-js";
import { extractDimension, normalizeSearch } from "../lib/dimensions.ts";

const TRANSACTION_SELECT =
  "id, value, description, transaction_at, class_id, class:class_id(name, type:type_id(name, nature:nature_id(name)))";

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function previousMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function fetchTransactionsForMonth(
  supabase: SupabaseClient,
  year: number,
  month: number
) {
  const { start, end } = monthRange(year, month);
  const { data, error } = await supabase
    .from("transaction")
    .select(TRANSACTION_SELECT)
    .gte("transaction_at", start)
    .lte("transaction_at", end);

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getNatureTotals(
  supabase: SupabaseClient,
  year: number,
  month: number
) {
  const rows = await fetchTransactionsForMonth(supabase, year, month);
  let income = 0;
  let expense = 0;

  for (const tx of rows) {
    const nature = tx.class?.type?.nature?.name;
    const value = Number(tx.value);
    if (nature === "Receita") income += value;
    else if (nature === "Despesa") expense += value;
  }

  return { income, expense, balance: income - expense, transactionCount: rows.length };
}

function aggregateByCategory(rows: Record<string, unknown>[], natureFilter?: string) {
  const map = new Map<string, { typeName: string; className: string; nature: string; total: number; count: number }>();

  for (const tx of rows) {
    const cls = tx.class as { name?: string; type?: { name?: string; nature?: { name?: string } } } | null;
    const nature = cls?.type?.nature?.name ?? "Desconhecido";
    if (natureFilter && nature !== natureFilter) continue;

    const typeName = cls?.type?.name ?? "Sem tipo";
    const className = cls?.name ?? "Sem classe";
    const key = `${nature}|${typeName}|${className}`;
    const existing = map.get(key) ?? { typeName, className, nature, total: 0, count: 0 };
    existing.total += Number(tx.value);
    existing.count += 1;
    map.set(key, existing);
  }

  return Array.from(map.values())
    .map((item) => ({
      nature: item.nature,
      typeName: item.typeName,
      className: item.className,
      dimensionLabel: `Natureza ${item.nature} · Tipo ${item.typeName} · Classe ${item.className}`,
      total: item.total,
      totalFormatted: formatBRL(item.total),
      transactionCount: item.count,
    }))
    .sort((a, b) => b.total - a.total);
}

function aggregateByType(rows: Record<string, unknown>[], natureFilter?: string) {
  const map = new Map<string, { nature: string; typeName: string; total: number; count: number }>();

  for (const tx of rows) {
    const cls = tx.class as { type?: { name?: string; nature?: { name?: string } } } | null;
    const nature = cls?.type?.nature?.name ?? "Desconhecido";
    if (natureFilter && nature !== natureFilter) continue;
    const typeName = cls?.type?.name ?? "Sem tipo";
    const key = `${nature}|${typeName}`;
    const existing = map.get(key) ?? { nature, typeName, total: 0, count: 0 };
    existing.total += Number(tx.value);
    existing.count += 1;
    map.set(key, existing);
  }

  return Array.from(map.values())
    .map((item) => ({
      nature: item.nature,
      typeName: item.typeName,
      dimensionLabel: `Natureza ${item.nature} · Tipo ${item.typeName}`,
      total: item.total,
      totalFormatted: formatBRL(item.total),
      transactionCount: item.count,
    }))
    .sort((a, b) => b.total - a.total);
}

function categoryTrends(currentRows: Record<string, unknown>[], previousRows: Record<string, unknown>[]) {
  const sumBy = (rows: Record<string, unknown>[]) => {
    const totals = new Map<string, number>();
    for (const tx of rows) {
      const cls = tx.class as { type?: { name?: string } } | null;
      const category = cls?.type?.name ?? "Outros";
      totals.set(category, (totals.get(category) ?? 0) + Number(tx.value));
    }
    return totals;
  };

  const current = sumBy(currentRows);
  const previous = sumBy(previousRows);
  const categories = new Set([...current.keys(), ...previous.keys()]);

  return Array.from(categories)
    .map((category) => {
      const currentMonth = current.get(category) ?? 0;
      const previousMonth = previous.get(category) ?? 0;
      const changePercent =
        previousMonth === 0
          ? currentMonth > 0 ? 100 : 0
          : ((currentMonth - previousMonth) / previousMonth) * 100;

      return {
        category,
        currentMonth,
        currentMonthFormatted: formatBRL(currentMonth),
        previousMonth,
        previousMonthFormatted: formatBRL(previousMonth),
        changePercent: Math.round(changePercent * 10) / 10,
      };
    })
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

function findUnusual(rows: Record<string, unknown>[]) {
  const expenses = rows.filter((tx) => {
    const cls = tx.class as { type?: { nature?: { name?: string } } } | null;
    return cls?.type?.nature?.name === "Despesa";
  });

  const stats = new Map<string, { sum: number; count: number }>();
  for (const tx of expenses) {
    const cls = tx.class as { type?: { name?: string } } | null;
    const category = cls?.type?.name ?? "Outros";
    const stat = stats.get(category) ?? { sum: 0, count: 0 };
    stat.sum += Number(tx.value);
    stat.count += 1;
    stats.set(category, stat);
  }

  const unusual: Record<string, unknown>[] = [];
  for (const tx of expenses) {
    const cls = tx.class as { type?: { name?: string } } | null;
    const category = cls?.type?.name ?? "Outros";
    const stat = stats.get(category);
    if (!stat || stat.count < 2) continue;
    const average = stat.sum / stat.count;
    const value = Number(tx.value);
    if (value >= average * 2) {
      const dim = extractDimension(tx.class as Parameters<typeof extractDimension>[0]);
      unusual.push({
        id: tx.id,
        description: tx.description,
        value,
        valueFormatted: formatBRL(value),
        transactionAt: tx.transaction_at,
        typeName: dim.typeName,
        ...dim,
        reason: `Valor ${Math.round((value / average) * 10) / 10}x acima da média do tipo ${dim.typeName}.`,
      });
    }
  }

  return unusual.sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 10);
}

async function resolveClassNature(
  supabase: SupabaseClient,
  classId: number
): Promise<string | null> {
  const { data, error } = await supabase
    .from("class")
    .select("id, type:type_id(nature:nature_id(name))")
    .eq("id", classId)
    .maybeSingle();

  if (error || !data) return null;
  const type = data.type as { nature?: { name?: string } } | null;
  return type?.nature?.name ?? null;
}

export async function executeAgentTool(
  supabase: SupabaseClient,
  userId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ result: unknown; pendingAction?: Record<string, unknown> }> {
  switch (toolName) {
    case "get_monthly_summary": {
      const year = Number(args.year);
      const month = Number(args.month);
      const totals = await getNatureTotals(supabase, year, month);
      return {
        result: {
          year,
          month,
          ...totals,
          incomeFormatted: formatBRL(totals.income),
          expenseFormatted: formatBRL(totals.expense),
          balanceFormatted: formatBRL(totals.balance),
        },
      };
    }

    case "get_balance_history": {
      const months = Math.min(Math.max(Number(args.months) || 3, 1), 12);
      const now = new Date();
      const history = [];

      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const totals = await getNatureTotals(supabase, d.getFullYear(), d.getMonth() + 1);
        history.push({
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          ...totals,
          balanceFormatted: formatBRL(totals.balance),
        });
      }

      return { result: { months: history } };
    }

    case "get_spending_by_category": {
      const year = Number(args.year);
      const month = Number(args.month);
      const nature = args.nature as string | undefined;
      const rows = await fetchTransactionsForMonth(supabase, year, month);
      const byClass = aggregateByCategory(rows, nature);
      const byType = aggregateByType(rows, nature);
      return {
        result: {
          byClass,
          byType,
          categories: byClass,
        },
      };
    }

    case "get_category_trends": {
      const year = Number(args.year);
      const month = Number(args.month);
      const prev = previousMonth(year, month);
      const currentRows = await fetchTransactionsForMonth(supabase, year, month);
      const previousRows = await fetchTransactionsForMonth(supabase, prev.year, prev.month);
      return { result: { trends: categoryTrends(currentRows, previousRows) } };
    }

    case "find_unusual_expenses": {
      const year = Number(args.year);
      const month = Number(args.month);
      const rows = await fetchTransactionsForMonth(supabase, year, month);
      return { result: { unusualExpenses: findUnusual(rows) } };
    }

    case "get_budget_status": {
      const budgetMonth = String(args.budget_month);
      const { data, error } = await supabase
        .from("vw_monthly_budget_summary")
        .select("*")
        .eq("budget_month", budgetMonth)
        .order("type_name", { ascending: true });

      if (error) throw new Error(error.message);

      const items = (data ?? []).map((item) => ({
        typeName: item.type_name,
        className: item.class_name,
        planned: Number(item.planned_value),
        spent: Number(item.spent_value),
        remaining: Number(item.remaining_value),
        percentageUsed: Number(item.percentage_used),
        status: item.status,
        plannedFormatted: formatBRL(Number(item.planned_value)),
        spentFormatted: formatBRL(Number(item.spent_value)),
      }));

      return { result: { budgetMonth, items } };
    }

    case "get_recurring_summary": {
      const { data, error } = await supabase
        .from("recurring_transaction")
        .select("id, value, description, installment_count, paid_parcels, class:class_id(name, type:type_id(nature:nature_id(name)))")
        .eq("status", true);

      if (error) throw new Error(error.message);

      const items = (data ?? []).map((rec) => {
        const paid = Array.isArray(rec.paid_parcels) ? rec.paid_parcels.length : 0;
        const total = rec.installment_count ?? 0;
        const dim = extractDimension(rec.class as Parameters<typeof extractDimension>[0]);
        return {
          id: rec.id,
          description: rec.description,
          value: Number(rec.value),
          valueFormatted: formatBRL(Number(rec.value)),
          installments: total,
          paidParcels: paid,
          openParcels: Math.max(total - paid, 0),
          ...dim,
        };
      });

      return {
        result: {
          totalActive: items.length,
          items,
        },
      };
    }

    case "list_dimensions": {
      const { data, error } = await supabase
        .from("nature")
        .select("id, name, types:type!nature_id(id, name, classes:class!type_id(id, name))");

      if (error) throw new Error(error.message);
      return { result: { dimensions: data ?? [] } };
    }

    case "search_transactions": {
      const limit = Math.min(Number(args.limit) || 10, 20);
      let query = supabase
        .from("transaction")
        .select(TRANSACTION_SELECT)
        .order("transaction_at", { ascending: false })
        .limit(limit);

      if (args.start_date) query = query.gte("transaction_at", String(args.start_date));
      if (args.end_date) query = query.lte("transaction_at", String(args.end_date));
      if (args.search) query = query.ilike("description", `%${String(args.search)}%`);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      let rows = data ?? [];
      if (args.nature) {
        rows = rows.filter((tx) => {
          const cls = tx.class as { type?: { nature?: { name?: string } } } | null;
          return cls?.type?.nature?.name === args.nature;
        });
      }

      return {
        result: {
          transactions: rows.map((tx) => {
            const dim = extractDimension(tx.class as Parameters<typeof extractDimension>[0]);
            return {
              id: tx.id,
              description: tx.description,
              value: Number(tx.value),
              valueFormatted: formatBRL(Number(tx.value)),
              transactionAt: tx.transaction_at,
              ...dim,
            };
          }),
        },
      };
    }

    case "resolve_class": {
      const query = normalizeSearch(String(args.query || ""));
      const natureFilter = args.nature as string | undefined;

      if (!query || query.length < 2) {
        throw new Error("Informe ao menos 2 caracteres para buscar a classe.");
      }

      const { data, error } = await supabase
        .from("class")
        .select("id, name, type:type_id(name, nature:nature_id(name))")
        .order("name");

      if (error) throw new Error(error.message);

      const matches = (data ?? [])
        .map((row) => {
          const dim = extractDimension(row as Parameters<typeof extractDimension>[0]);
          return {
            classId: row.id,
            ...dim,
          };
        })
        .filter((item) => {
          if (natureFilter && item.nature !== natureFilter) return false;
          const haystack = normalizeSearch(
            `${item.className} ${item.typeName} ${item.nature}`
          );
          return haystack.includes(query);
        })
        .slice(0, 8);

      return {
        result: {
          query: args.query,
          matchCount: matches.length,
          matches,
          hint:
            matches.length === 0
              ? "Nenhuma classe encontrada. Use list_dimensions para ver todas ou peça ao usuário o nome exato."
              : matches.length === 1
                ? "Classe única encontrada — pode usar classId em propose_create_transaction."
                : "Múltiplas opções — confirme com o usuário qual classe usar.",
        },
      };
    }

    case "generate_insights": {
      const now = new Date();
      const year = Number(args.year) || now.getFullYear();
      const month = Number(args.month) || now.getMonth() + 1;
      const prev = previousMonth(year, month);

      const current = await getNatureTotals(supabase, year, month);
      const previous = await getNatureTotals(supabase, prev.year, prev.month);
      const currentRows = await fetchTransactionsForMonth(supabase, year, month);
      const previousRows = await fetchTransactionsForMonth(supabase, prev.year, prev.month);
      const trends = categoryTrends(currentRows, previousRows);
      const unusual = findUnusual(currentRows);
      const topExpenses = aggregateByCategory(currentRows, "Despesa").slice(0, 8);

      const budgetMonth = `${year}-${String(month).padStart(2, "0")}-01`;
      const { data: budgetData } = await supabase
        .from("vw_monthly_budget_summary")
        .select("type_name, class_name, percentage_used, status, planned_value, spent_value, remaining_value")
        .eq("budget_month", budgetMonth);

      const { data: recurringData } = await supabase
        .from("recurring_transaction")
        .select("id, value, description, installment_count, paid_parcels")
        .eq("status", true);

      const recurringItems = (recurringData ?? []).map((rec) => {
        const paid = Array.isArray(rec.paid_parcels) ? rec.paid_parcels.length : 0;
        const total = rec.installment_count ?? 0;
        const openParcels = Math.max(total - paid, 0);
        return {
          description: rec.description,
          monthlyValue: Number(rec.value),
          openParcels,
          remainingCommitment: Number(rec.value) * openParcels,
        };
      });

      const monthlyCommitted = recurringItems.reduce((s, r) => s + r.monthlyValue, 0);
      const totalRemainingCommitment = recurringItems.reduce(
        (s, r) => s + r.remainingCommitment,
        0
      );

      const expenseChangePercent =
        previous.expense > 0
          ? Math.round(((current.expense - previous.expense) / previous.expense) * 1000) / 10
          : null;

      const savingsRate =
        current.income > 0
          ? Math.round(((current.income - current.expense) / current.income) * 1000) / 10
          : null;

      const insights: string[] = [];
      const opportunities: string[] = [];
      const risks: string[] = [];

      if (expenseChangePercent !== null && Math.abs(expenseChangePercent) >= 10) {
        insights.push(
          `Despesas ${expenseChangePercent > 0 ? "aumentaram" : "diminuíram"} ${Math.abs(expenseChangePercent)}% vs mês anterior (${formatBRL(previous.expense)} → ${formatBRL(current.expense)}).`
        );
      }

      if (savingsRate !== null) {
        if (savingsRate < 0) {
          risks.push(
            `Saldo negativo: despesas superam receitas em ${formatBRL(Math.abs(current.balance))} (${Math.abs(savingsRate)}% acima da renda).`
          );
        } else if (savingsRate < 10 && current.income > 0) {
          risks.push(
            `Taxa de poupança baixa (${savingsRate}% da renda). Margem apertada para imprevistos.`
          );
          opportunities.push(
            "Revise as 3 maiores categorias de despesa — pequenos cortes podem aumentar sua reserva."
          );
        } else if (savingsRate >= 20) {
          insights.push(`Taxa de poupança saudável: ${savingsRate}% da renda no período.`);
        }
      }

      for (const trend of trends.slice(0, 5)) {
        if (Math.abs(trend.changePercent) >= 15) {
          insights.push(
            `"${trend.category}": ${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}% (${trend.previousMonthFormatted} → ${trend.currentMonthFormatted}).`
          );
          if (trend.changePercent > 25) {
            opportunities.push(
              `Investigue o aumento em "${trend.category}" — pode ser gasto pontual ou hábito novo.`
            );
          }
        }
      }

      const budgetAlerts = (budgetData ?? []).filter(
        (item) => item.status === "CRÍTICO" || item.status === "ESTOUROU"
      );
      for (const item of budgetAlerts) {
        risks.push(
          `Orçamento "${item.type_name}${item.class_name ? ` / ${item.class_name}` : ""}" — ${item.status} (${Math.round(Number(item.percentage_used))}% usado).`
        );
      }

      const budgetWarnings = (budgetData ?? []).filter(
        (item) =>
          item.status !== "CRÍTICO" &&
          item.status !== "ESTOUROU" &&
          Number(item.percentage_used) >= 80 &&
          Number(item.planned_value) > 0
      );
      for (const item of budgetWarnings.slice(0, 2)) {
        insights.push(
          `"${item.type_name}" consumiu ${Math.round(Number(item.percentage_used))}% do planejado — restam ${formatBRL(Number(item.remaining_value))}.`
        );
      }

      if (unusual.length > 0) {
        insights.push(
          `${unusual.length} despesa(s) acima do padrão: maior ${unusual[0].valueFormatted} (${unusual[0].description}).`
        );
        opportunities.push(
          "Confira as despesas atípicas — podem ser erros de lançamento ou oportunidades de negociar/cancelar."
        );
      }

      if (recurringItems.length > 0) {
        insights.push(
          `${recurringItems.length} parcela(s) ativa(s): ~${formatBRL(monthlyCommitted)}/mês comprometidos, ${formatBRL(totalRemainingCommitment)} restantes no total.`
        );
        if (monthlyCommitted > current.expense * 0.3 && current.expense > 0) {
          risks.push(
            `Compromissos fixos representam parcela significativa das despesas (~${Math.round((monthlyCommitted / current.expense) * 100)}%).`
          );
        }
      }

      if (topExpenses.length > 0 && current.expense > 0) {
        const top3Share =
          (topExpenses.slice(0, 3).reduce((s, c) => s + c.total, 0) / current.expense) * 100;
        if (top3Share >= 60) {
          insights.push(
            `Concentração: as 3 maiores categorias respondem por ${Math.round(top3Share)}% das despesas.`
          );
        }
      }

      if ((budgetData ?? []).length === 0 && current.expense > 0) {
        opportunities.push(
          "Você ainda não tem orçamento cadastrado — definir limites por categoria ajuda a detectar estouros cedo."
        );
      }

      return {
        result: {
          period: { year, month },
          summary: {
            ...current,
            incomeFormatted: formatBRL(current.income),
            expenseFormatted: formatBRL(current.expense),
            balanceFormatted: formatBRL(current.balance),
          },
          previousSummary: {
            ...previous,
            expenseFormatted: formatBRL(previous.expense),
            balanceFormatted: formatBRL(previous.balance),
          },
          expenseChangePercent,
          savingsRate,
          topExpenseCategories: topExpenses,
          categoryTrends: trends.slice(0, 8),
          unusualExpenses: unusual.slice(0, 5),
          budgetAlerts: budgetAlerts.map((item) => ({
            typeName: item.type_name,
            className: item.class_name,
            status: item.status,
            percentageUsed: Number(item.percentage_used),
            spentFormatted: formatBRL(Number(item.spent_value)),
            plannedFormatted: formatBRL(Number(item.planned_value)),
          })),
          recurring: {
            activeCount: recurringItems.length,
            monthlyCommitted,
            monthlyCommittedFormatted: formatBRL(monthlyCommitted),
            totalRemainingCommitment,
            totalRemainingFormatted: formatBRL(totalRemainingCommitment),
            items: recurringItems.slice(0, 5),
          },
          insights,
          risks,
          opportunities,
        },
      };
    }

    case "propose_create_transaction": {
      const value = Number(args.value);
      const classId = Number(args.class_id);
      const description = String(args.description).trim();
      const transactionAt = String(args.transaction_at || new Date().toISOString().slice(0, 10));
      const expectedNature = args.nature as string | undefined;

      if (!value || value <= 0) throw new Error("Valor inválido.");
      if (!description) throw new Error("Descrição obrigatória.");
      if (!classId) throw new Error("Categoria (class_id) obrigatória.");

      const nature = await resolveClassNature(supabase, classId);
      if (!nature) throw new Error("Categoria não encontrada.");

      if (expectedNature && nature !== expectedNature) {
        throw new Error(`A categoria selecionada é do tipo "${nature}", não "${expectedNature}".`);
      }

      const { data: cls } = await supabase
        .from("class")
        .select("name, type:type_id(name)")
        .eq("id", classId)
        .maybeSingle();

      const payload = {
        value,
        class_id: classId,
        description,
        transaction_at: transactionAt,
      };

      const fields = [
        { label: "Valor", value: formatBRL(value) },
        { label: "Descrição", value: description },
        { label: "Categoria", value: (cls as { name?: string })?.name ?? String(classId) },
        { label: "Tipo", value: (cls as { type?: { name?: string } })?.type?.name ?? "-" },
        { label: "Natureza", value: nature },
        { label: "Data", value: transactionAt.split("-").reverse().join("/") },
      ];

      const { data: pending, error } = await supabase
        .from("agent_pending_action")
        .insert([
          {
            user_id: userId,
            action_type: "create_transaction",
            payload,
            summary: `Cadastrar ${nature.toLowerCase()} de ${formatBRL(value)}`,
            fields,
          },
        ])
        .select("id, summary, fields, expires_at")
        .single();

      if (error) throw new Error(error.message);

      return {
        result: {
          status: "confirmation_required",
          message: "Ação proposta. Aguardando confirmação do usuário.",
          pendingActionId: pending.id,
        },
        pendingAction: {
          id: pending.id,
          actionType: "create_transaction",
          summary: pending.summary,
          fields: pending.fields,
          expiresAt: pending.expires_at,
        },
      };
    }

    case "propose_create_recurring": {
      const value = Number(args.value);
      const classId = Number(args.class_id);
      const description = String(args.description).trim();
      const installmentCount = Number(args.installment_count);
      const dueDay = Number(args.due_day) || new Date().getDate();
      const paymentStartDate =
        String(args.payment_start_date || new Date().toISOString().slice(0, 10));

      if (!value || value <= 0) throw new Error("Valor inválido.");
      if (!description) throw new Error("Descrição obrigatória.");
      if (!classId) throw new Error("Categoria obrigatória.");
      if (!installmentCount || installmentCount < 2) {
        throw new Error("Número de parcelas deve ser >= 2.");
      }

      const payload = {
        class_id: classId,
        value,
        description,
        frequency: "Mensal",
        validity: null,
        due_day: Math.min(Math.max(dueDay, 1), 28),
        installment_count: installmentCount,
        payment_start_date: paymentStartDate,
        status: true,
      };

      const { data: cls } = await supabase
        .from("class")
        .select("name")
        .eq("id", classId)
        .maybeSingle();

      const totalValue = value * installmentCount;
      const fields = [
        { label: "Valor por parcela", value: formatBRL(value) },
        { label: "Total", value: formatBRL(totalValue) },
        { label: "Parcelas", value: String(installmentCount) },
        { label: "Descrição", value: description },
        { label: "Categoria", value: (cls as { name?: string })?.name ?? String(classId) },
        { label: "Dia de vencimento", value: String(payload.due_day) },
        { label: "Início", value: paymentStartDate.split("-").reverse().join("/") },
      ];

      const { data: pending, error } = await supabase
        .from("agent_pending_action")
        .insert([
          {
            user_id: userId,
            action_type: "create_recurring",
            payload,
            summary: `Cadastrar compra parcelada (${installmentCount}x de ${formatBRL(value)})`,
            fields,
          },
        ])
        .select("id, summary, fields, expires_at")
        .single();

      if (error) throw new Error(error.message);

      return {
        result: {
          status: "confirmation_required",
          message: "Ação proposta. Aguardando confirmação do usuário.",
          pendingActionId: pending.id,
        },
        pendingAction: {
          id: pending.id,
          actionType: "create_recurring",
          summary: pending.summary,
          fields: pending.fields,
          expiresAt: pending.expires_at,
        },
      };
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${toolName}`);
  }
}

export async function confirmPendingAction(
  supabase: SupabaseClient,
  userId: string,
  actionId: string
) {
  const { data: pending, error } = await supabase
    .from("agent_pending_action")
    .select("*")
    .eq("id", actionId)
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!pending) throw new Error("Ação pendente não encontrada ou expirada.");

  if (pending.action_type === "create_transaction") {
    const { error: insertError } = await supabase
      .from("transaction")
      .insert([pending.payload]);

    if (insertError) throw new Error(insertError.message);
  } else if (pending.action_type === "create_recurring") {
    const { error: insertError } = await supabase
      .from("recurring_transaction")
      .insert([pending.payload]);

    if (insertError) throw new Error(insertError.message);
  } else {
    throw new Error("Tipo de ação não suportado.");
  }

  await supabase.from("agent_pending_action").delete().eq("id", actionId);

  return {
    actionType: pending.action_type,
    summary: pending.summary,
  };
}

export async function cancelPendingAction(
  supabase: SupabaseClient,
  userId: string,
  actionId: string
) {
  await supabase
    .from("agent_pending_action")
    .delete()
    .eq("id", actionId)
    .eq("user_id", userId);
}
