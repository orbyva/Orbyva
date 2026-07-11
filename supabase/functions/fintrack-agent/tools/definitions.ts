export const FUNCTION_DECLARATIONS = [
  {
    name: "get_monthly_summary",
    description: "Retorna receitas, despesas e saldo de um mês específico.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "number", description: "Ano (ex: 2026)" },
        month: { type: "number", description: "Mês (1-12)" },
      },
      required: ["year", "month"],
    },
  },
  {
    name: "get_balance_history",
    description: "Retorna saldo dos últimos N meses.",
    parameters: {
      type: "object",
      properties: {
        months: { type: "number", description: "Quantidade de meses (1-12)" },
      },
    },
  },
  {
    name: "get_spending_by_category",
    description:
      "Gastos/receitas agrupados por classe e por tipo em um mês. Retorna natureza, tipo e classe em cada item.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "number" },
        month: { type: "number" },
        nature: { type: "string", enum: ["Receita", "Despesa"] },
      },
      required: ["year", "month"],
    },
  },
  {
    name: "get_category_trends",
    description: "Compara categorias entre mês atual e anterior.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "number" },
        month: { type: "number" },
      },
      required: ["year", "month"],
    },
  },
  {
    name: "find_unusual_expenses",
    description: "Despesas acima do padrão no mês.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "number" },
        month: { type: "number" },
      },
      required: ["year", "month"],
    },
  },
  {
    name: "get_budget_status",
    description: "Status do orçamento (budget_month YYYY-MM-01).",
    parameters: {
      type: "object",
      properties: {
        budget_month: { type: "string", description: "YYYY-MM-01" },
      },
      required: ["budget_month"],
    },
  },
  {
    name: "get_recurring_summary",
    description: "Resumo de parcelas/recorrências ativas.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "resolve_class",
    description:
      "Busca class_id pelo nome da classe ou tipo (ex.: 'internet', 'supermercado'). Retorna natureza, tipo e classe. Use antes de cadastrar.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Termo de busca (classe ou tipo)" },
        nature: { type: "string", enum: ["Receita", "Despesa"], description: "Filtrar por natureza" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_dimensions",
    description: "Lista naturezas, tipos e classes para cadastro.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "search_transactions",
    description: "Busca transações.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string" },
        nature: { type: "string", enum: ["Receita", "Despesa"] },
        start_date: { type: "string" },
        end_date: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "generate_insights",
    description:
      "Análise consultiva completa do mês: tendências, riscos, oportunidades, orçamento, parcelas e despesas atípicas. Use para diagnósticos e perguntas abertas.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "number" },
        month: { type: "number" },
      },
    },
  },
  {
    name: "propose_create_transaction",
    description: "Propõe cadastro de transação (requer confirmação do usuário).",
    parameters: {
      type: "object",
      properties: {
        value: { type: "number" },
        description: { type: "string" },
        class_id: { type: "number" },
        transaction_at: { type: "string" },
        nature: { type: "string", enum: ["Receita", "Despesa"] },
      },
      required: ["value", "description", "class_id"],
    },
  },
  {
    name: "propose_create_recurring",
    description: "Propõe cadastro parcelado (requer confirmação do usuário).",
    parameters: {
      type: "object",
      properties: {
        value: { type: "number", description: "Valor total do produto/compra" },
        description: { type: "string" },
        class_id: { type: "number" },
        installment_count: { type: "number" },
        due_day: { type: "number" },
        payment_start_date: { type: "string" },
      },
      required: ["value", "description", "class_id", "installment_count"],
    },
  },
] as const;

export function toOpenAiTools() {
  return FUNCTION_DECLARATIONS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
