export const AGENT_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "get_monthly_summary",
      description:
        "Retorna receitas, despesas e saldo de um mês específico (year/month).",
      parameters: {
        type: "object",
        properties: {
          year: { type: "number", description: "Ano (ex: 2026)" },
          month: { type: "number", description: "Mês (1-12)" },
        },
        required: ["year", "month"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_balance_history",
      description: "Retorna saldo (receita - despesa) dos últimos N meses.",
      parameters: {
        type: "object",
        properties: {
          months: {
            type: "number",
            description: "Quantidade de meses (padrão 3, máx 12)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_spending_by_category",
      description:
        "Lista gastos/receitas agrupados por categoria em um mês. Opcionalmente filtra por natureza.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "number" },
          month: { type: "number" },
          nature: {
            type: "string",
            enum: ["Receita", "Despesa"],
            description: "Filtrar por natureza",
          },
        },
        required: ["year", "month"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_category_trends",
      description:
        "Compara gastos por categoria entre o mês informado e o mês anterior.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "number" },
          month: { type: "number" },
        },
        required: ["year", "month"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_unusual_expenses",
      description:
        "Identifica despesas acima do padrão habitual no mês informado.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "number" },
          month: { type: "number" },
        },
        required: ["year", "month"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_budget_status",
      description: "Retorna status do orçamento do mês (budget_month YYYY-MM-01).",
      parameters: {
        type: "object",
        properties: {
          budget_month: {
            type: "string",
            description: "Primeiro dia do mês no formato YYYY-MM-01",
          },
        },
        required: ["budget_month"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_recurring_summary",
      description: "Resumo de parcelas/recorrências ativas.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_dimensions",
      description:
        "Lista naturezas, tipos e classes disponíveis para cadastro. Use para resolver nomes de categorias.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_transactions",
      description: "Busca transações por texto, natureza e período.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string" },
          nature: { type: "string", enum: ["Receita", "Despesa"] },
          start_date: { type: "string", description: "YYYY-MM-DD" },
          end_date: { type: "string", description: "YYYY-MM-DD" },
          limit: { type: "number", description: "Máx 20" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_insights",
      description:
        "Gera insights automáticos sobre finanças do mês atual (tendências, orçamento, anomalias).",
      parameters: {
        type: "object",
        properties: {
          year: { type: "number" },
          month: { type: "number" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_create_transaction",
      description:
        "Propõe cadastro de transação (despesa ou receita). Requer confirmação do usuário. Use list_dimensions para resolver class_id.",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number", description: "Valor em reais" },
          description: { type: "string" },
          class_id: { type: "number", description: "ID da classe (categoria)" },
          transaction_at: {
            type: "string",
            description: "Data YYYY-MM-DD (padrão: hoje)",
          },
          nature: {
            type: "string",
            enum: ["Receita", "Despesa"],
            description: "Natureza para validação",
          },
        },
        required: ["value", "description", "class_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_create_recurring",
      description:
        "Propõe cadastro de compra parcelada/recorrente. Requer confirmação do usuário.",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number", description: "Valor de cada parcela" },
          description: { type: "string" },
          class_id: { type: "number" },
          installment_count: { type: "number", description: "Número de parcelas" },
          due_day: { type: "number", description: "Dia de vencimento (1-28)" },
          payment_start_date: {
            type: "string",
            description: "Data início YYYY-MM-DD",
          },
        },
        required: ["value", "description", "class_id", "installment_count"],
      },
    },
  },
] as const;

export type AgentToolName =
  (typeof AGENT_TOOL_DEFINITIONS)[number]["function"]["name"];
