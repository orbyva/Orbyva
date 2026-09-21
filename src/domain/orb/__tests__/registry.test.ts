import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  ORB_TOOL_TIMEOUT_MS,
  orbToolErrorCode,
  orbTools,
  orbToolTitle,
  runOrbTool,
} from "../../../../supabase/functions/_shared/orb/registry.ts";
import { OrbToolError } from "../../../../supabase/functions/_shared/orb/types.ts";
import type {
  OrbDb,
  OrbTool,
} from "../../../../supabase/functions/_shared/orb/types.ts";
import { fakeDb, filtro, leituraDe } from "./fakeDb.ts";
import type { Recorded } from "./fakeDb.ts";

/**
 * O registro de tools mora fora de `src/` porque também é consumido pelo Deno da Edge Function e
 * pelo Node do servidor MCP (ver `mcp/README.md`). Ele não tem suíte própria em nenhum dos dois
 * runtimes, então a cobertura vem daqui — o Vitest é o único lugar do projeto que roda os três
 * lados do mesmo código.
 */

const ctx = (db: OrbDb) => ({
  db,
  userId: "user-1",
  today: "2026-09-08",
  timezone: "America/Sao_Paulo",
});

/** Uma despesa do extrato, com a árvore `class → type → nature` que as tools de finanças leem. */
function despesa(id: number, transactionAt: string, value: number, categoria = "Mercado") {
  return {
    id,
    value,
    description: `Compra ${id}`,
    transaction_at: transactionAt,
    installment_number: null,
    class: {
      id: 9,
      name: categoria,
      type: { name: "Alimentação", exclude_from_spend: false, nature: { name: "Despesa" } },
    },
  };
}

describe("registro de tools da Orb", () => {
  it("não tem nome de tool repetido", () => {
    const names = orbTools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("declara descrição em toda tool e em todo campo de input", () => {
    for (const tool of orbTools) {
      expect(tool.description.length, `${tool.name} sem descrição`).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
      for (const [field, schema] of Object.entries(tool.inputSchema.properties)) {
        expect(
          (schema as { description?: string }).description,
          `${tool.name}.${field} sem description — é o que faz o modelo escolher a tool certa`
        ).toBeTruthy();
      }
    }
  });

  it("toda tool obrigatória está declarada em properties", () => {
    for (const tool of orbTools) {
      for (const required of tool.inputSchema.required ?? []) {
        expect(Object.keys(tool.inputSchema.properties)).toContain(required);
      }
    }
  });
});

describe("runOrbTool", () => {
  it("filtra por user_id além do RLS e resume o gasto por categoria", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      {
        transaction: [
          {
            id: 1,
            value: 50,
            description: "Burger",
            transaction_at: "2026-09-03",
            installment_number: null,
            class: {
              id: 9,
              name: "Fast-food",
              type: { name: "Alimentação", exclude_from_spend: false, nature: { name: "Despesa" } },
            },
          },
          {
            id: 2,
            value: 30,
            description: "Lanche",
            transaction_at: "2026-09-05",
            installment_number: null,
            class: {
              id: 9,
              name: "Fast-food",
              type: { name: "Alimentação", exclude_from_spend: false, nature: { name: "Despesa" } },
            },
          },
          {
            id: 3,
            value: 1000,
            description: "Salário",
            transaction_at: "2026-09-01",
            installment_number: null,
            class: {
              id: 1,
              name: "Salário",
              type: { name: "Renda", exclude_from_spend: false, nature: { name: "Receita" } },
            },
          },
        ],
      },
      log
    );

    const { ok, result } = await runOrbTool("query_spend_by_category", {}, ctx(db));

    expect(ok).toBe(true);
    expect(result).toMatchObject({
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      total_expense: 80,
      total_income: 1000,
      balance: 920,
    });
    // O breakdown vem ordenado por valor, receita e despesa juntas — o campo `nature` é o que
    // separa as duas para o modelo.
    const breakdown = (result as { breakdown: { category: string }[] }).breakdown;
    expect(breakdown[0]).toMatchObject({ category: "Salário", nature: "Receita", total: 1000 });
    expect(breakdown.find((item) => item.category === "Fast-food")).toMatchObject({
      nature: "Despesa",
      total: 80,
      count: 2,
    });
    expect(log[0].filters).toContainEqual(["eq:user_id", "user-1"]);
  });

  it("marca como atrasada a tarefa com prazo anterior a hoje", async () => {
    const db = fakeDb({
      task: [
        { id: "a", title: "Atrasada", status: "todo", due_date: "2026-09-01", due_time: null },
        { id: "b", title: "Hoje", status: "todo", due_date: "2026-09-08", due_time: null },
      ],
    });

    const { ok, result } = await runOrbTool("query_tasks", {}, ctx(db));
    const tasks = (result as { tasks: { title: string; overdue: boolean }[] }).tasks;

    expect(ok).toBe(true);
    expect(tasks.find((task) => task.title === "Atrasada")?.overdue).toBe(true);
    expect(tasks.find((task) => task.title === "Hoje")?.overdue).toBe(false);
  });

  it("simula o parcelamento contra a média do histórico, sem gravar nada", async () => {
    const db = fakeDb({
      transaction: [
        {
          id: 1,
          value: 3000,
          description: "Salário",
          transaction_at: "2026-08-01",
          installment_number: null,
          class: {
            id: 1,
            name: "Salário",
            type: { name: "Renda", exclude_from_spend: false, nature: { name: "Receita" } },
          },
        },
      ],
    });

    const { ok, result } = await runOrbTool(
      "simulate_installment_impact",
      { total_value: 6000, installment_count: 12, months_of_history: 1 },
      ctx(db)
    );

    expect(ok).toBe(true);
    expect(result).toMatchObject({
      installment_value: 500,
      average_monthly_income: 3000,
      average_monthly_expense: 0,
      balance_after_installment: 2500,
      installment_share_of_income: 16.67,
    });
  });

  it("devolve erro de input como resultado, não como exceção", async () => {
    const { ok, result } = await runOrbTool(
      "query_transactions",
      { start_date: "08/09/2026" },
      ctx(fakeDb({}))
    );

    expect(ok).toBe(false);
    expect((result as { error: string }).error).toContain("YYYY-MM-DD");
    expect(orbToolErrorCode(result)).toBe("input_invalido");
  });

  it("devolve erro em tool desconhecida em vez de derrubar o host", async () => {
    const { ok, result } = await runOrbTool("query_inexistente", {}, ctx(fakeDb({})));

    expect(ok).toBe(false);
    expect((result as { error: string }).error).toContain("query_inexistente");
    expect(orbToolErrorCode(result)).toBe("nao_encontrado");
  });
});

/**
 * Bug B12: o host reconhecia sessão expirada por regex no TEXTO do erro. Com a mensagem estável,
 * quem carrega a causa é o `code` — sem ele, a reautenticação automática do MCP morre calada.
 */
describe("code de erro no resultado", () => {
  it("classifica erro do banco sem vazar o texto do Postgrest para o modelo", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const db = {
        from: () => {
          throw new OrbToolError(
            "Não consegui ler as transações agora.",
            "erro_de_banco",
            "column transaction.user_id does not exist"
          );
        },
      } as unknown as OrbDb;
      const { ok, result } = await runOrbTool("query_transactions", {}, ctx(db));

      expect(ok).toBe(false);
      expect(orbToolErrorCode(result)).toBe("erro_de_banco");
      expect((result as { error: string }).error).not.toContain("user_id");
      // `detail` fica no erro e no log; nunca no que volta para o modelo.
      expect(Object.keys(result as object).sort()).toEqual(["code", "error"]);
    } finally {
      log.mockRestore();
    }
  });

  it("marca sessão expirada mesmo em erro que não passou pelo unwrap", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const db = {
        from: () => {
          throw new Error("JWT expired");
        },
      } as unknown as OrbDb;
      const { ok, result } = await runOrbTool("query_transactions", {}, ctx(db));

      expect(ok).toBe(false);
      expect(orbToolErrorCode(result)).toBe("auth_expirada");
      expect((result as { error: string }).error).not.toContain("JWT");
    } finally {
      log.mockRestore();
    }
  });

  it("orbToolTitle devolve o rótulo da tool, com o name como fallback", () => {
    for (const tool of orbTools) {
      expect(orbToolTitle(tool.name)).toBe(tool.title ?? tool.name);
    }
    expect(orbToolTitle("query_inexistente")).toBe("query_inexistente");
  });
});

/**
 * Bug B1: `transaction_at` é `timestamptz`, e `.lte(coluna, "2026-09-30")` é lido pelo Postgres
 * como `2026-09-30T00:00:00Z` — o último dia do mês inteiro sumia do total.
 */
describe("janela de datas nas tools de finanças (B1)", () => {
  it("inclui a transação da noite do último dia do mês", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      { transaction: [despesa(1, "2026-09-30T22:00:00Z", 120)] },
      log
    );

    const { ok, result } = await runOrbTool(
      "query_spend_by_category",
      { month: "2026-09" },
      ctx(db)
    );
    const leitura = leituraDe(log, "transaction");

    expect(ok).toBe(true);
    expect(filtro(leitura, "gte:transaction_at")).toBe("2026-09-01");
    // A asserção que importa: fronteira EXCLUSIVA no dia seguinte, nunca `.lte` no dia 30.
    expect(filtro(leitura, "lt:transaction_at")).toBe("2026-10-01");
    expect(leitura.filters.some(([chave]) => chave === "lte:transaction_at")).toBe(false);
    expect(result).toMatchObject({ total_expense: 120, transaction_count: 1 });
  });

  it("usa a mesma fronteira exclusiva ao listar lançamentos", async () => {
    const log: Recorded[] = [];
    const db = fakeDb({ transaction: [despesa(1, "2026-09-30T22:00:00Z", 120)] }, log);

    const { ok, result } = await runOrbTool("query_transactions", {}, ctx(db));
    const leitura = leituraDe(log, "transaction");

    expect(ok).toBe(true);
    expect(filtro(leitura, "gte:transaction_at")).toBe("2026-09-01");
    expect(filtro(leitura, "lt:transaction_at")).toBe("2026-10-01");
    expect((result as { transactions: unknown[] }).transactions).toHaveLength(1);
  });

  it("simula sobre meses de calendário fechados, não sobre 30×N dias (B7)", async () => {
    const log: Recorded[] = [];
    // Aluguel de 2000 todo dia 8. Em 3 meses fechados são 3 ocorrências: média 2000/mês.
    const db = fakeDb(
      {
        transaction: [
          despesa(1, "2026-06-08T12:00:00Z", 2000, "Aluguel"),
          despesa(2, "2026-07-08T12:00:00Z", 2000, "Aluguel"),
          despesa(3, "2026-08-08T12:00:00Z", 2000, "Aluguel"),
        ],
      },
      log
    );

    const { ok, result } = await runOrbTool(
      "simulate_installment_impact",
      { total_value: 1200, installment_count: 12, months_of_history: 3 },
      { ...ctx(db), today: "2026-09-07" }
    );
    const leitura = leituraDe(log, "transaction");

    expect(ok).toBe(true);
    expect(filtro(leitura, "gte:transaction_at")).toBe("2026-06-01");
    expect(filtro(leitura, "lt:transaction_at")).toBe("2026-09-01");
    expect(result).toMatchObject({
      history_months: 3,
      history_start_date: "2026-06-01",
      history_end_date: "2026-08-31",
      average_monthly_expense: 2000,
      installment_value: 100,
    });
  });
});

/** Bug B8: sem paginação o PostgREST corta em `db.max_rows` (1000) sem avisar ninguém. */
describe("paginação do extrato (B8)", () => {
  it("lê além da primeira página e não avisa truncagem quando não houve", async () => {
    const log: Recorded[] = [];
    const transaction = Array.from({ length: 1003 }, (_, indice) =>
      despesa(indice, "2026-09-10T12:00:00Z", 1)
    );

    const { ok, result } = await runOrbTool(
      "query_spend_by_category",
      { month: "2026-09" },
      ctx(fakeDb({ transaction }, log))
    );

    expect(ok).toBe(true);
    expect(result).toMatchObject({ transaction_count: 1003, total_expense: 1003 });
    expect(result).not.toHaveProperty("truncated");
    const leituras = log.filter((entry) => entry.table === "transaction");
    expect(leituras.map((entry) => filtro(entry, "range"))).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("avisa o modelo que o total é parcial quando bate o teto de linhas", async () => {
    const transaction = Array.from({ length: 5000 }, (_, indice) =>
      despesa(indice, "2026-09-10T12:00:00Z", 1)
    );

    const { ok, result } = await runOrbTool(
      "query_spend_by_category",
      { month: "2026-09" },
      ctx(fakeDb({ transaction }))
    );

    expect(ok).toBe(true);
    expect(result).toMatchObject({ truncated: true, transaction_count: 5000 });
    expect((result as { truncated_warning: string }).truncated_warning).toContain("PARCIAIS");
  });

  it("conta tarefas por projeto sem baixar a tabela inteira de uma vez", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      {
        project: [{ id: "p1", name: "Casa", description: null, status: "active", goal_id: null }],
        task: [
          { id: "t1", project_id: "p1", status: "todo" },
          { id: "t2", project_id: "p1", status: "done" },
          { id: "t3", project_id: null, status: "todo" },
        ],
      },
      log
    );

    const { ok, result } = await runOrbTool("query_projects", {}, ctx(db));

    expect(ok).toBe(true);
    expect(result).toMatchObject({ counts_truncated: false });
    expect((result as { projects: unknown[] }).projects[0]).toMatchObject({
      id: "p1",
      tasks_open: 1,
      tasks_done: 1,
    });
    expect(filtro(leituraDe(log, "task"), "range")).toEqual([0, 999]);
  });
});

/** Bug B6: `starts_at` é `timestamptz` e a fronteira `YYYY-MM-DD` é lida em UTC, não no fuso. */
describe("query_agenda no fuso do usuário (B6)", () => {
  it("mantém o evento das 23h30 no dia local e descarta os vizinhos", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      {
        project_event: [
          // 2026-09-16T02:30Z — em UTC já é dia 16, em São Paulo ainda é 15.
          { id: "e1", title: "Jantar", starts_at: "2026-09-15T23:30:00-03:00", ends_at: null, project_id: null },
          { id: "e2", title: "Depois", starts_at: "2026-09-16T23:30:00-03:00", ends_at: null, project_id: null },
          { id: "e3", title: "Antes", starts_at: "2026-09-14T23:30:00-03:00", ends_at: null, project_id: null },
        ],
        task: [],
      },
      log
    );

    const { ok, result } = await runOrbTool(
      "query_agenda",
      { start_date: "2026-09-15", days: 1 },
      ctx(db)
    );
    const eventos = (result as { events: { id: string; local_date: string }[] }).events;
    const leitura = leituraDe(log, "project_event");

    expect(ok).toBe(true);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ id: "e1", local_date: "2026-09-15" });
    expect(result).toMatchObject({ timezone: "America/Sao_Paulo" });
    // A busca abre um dia para cada lado; quem recorta é a data local calculada em TS.
    expect(filtro(leitura, "gte:starts_at")).toBe("2026-09-14");
    expect(filtro(leitura, "lt:starts_at")).toBe("2026-09-17");
  });
});

/**
 * Validador de input do registry. As mensagens são escritas para o modelo se corrigir sozinho na
 * chamada seguinte — daí sempre nomearem o campo e listarem o que é aceito.
 */
describe("validação de input (1A.5)", () => {
  it('coage o booleano em texto: {overdue:"true"} vira o filtro de atrasadas', async () => {
    const log: Recorded[] = [];
    const { ok } = await runOrbTool(
      "query_tasks",
      { overdue: "true" },
      ctx(fakeDb({ task: [] }, log))
    );
    const leitura = leituraDe(log, "task");

    expect(ok).toBe(true);
    expect(filtro(leitura, "lt:due_date")).toBe("2026-09-08");
    expect(filtro(leitura, "neq:status")).toBe("done");
  });

  it('coage número em texto: {limit:"5"} chega como número no builder', async () => {
    const log: Recorded[] = [];
    const { ok } = await runOrbTool(
      "query_transactions",
      { limit: "5" },
      ctx(fakeDb({ transaction: [] }, log))
    );

    expect(ok).toBe(true);
    expect(filtro(leituraDe(log, "transaction"), "limit")).toBe(5);
  });

  it("rejeita chave desconhecida dizendo quais são aceitas", async () => {
    const { ok, result } = await runOrbTool("query_tasks", { foo: 1 }, ctx(fakeDb({})));
    const error = (result as { error: string }).error;

    expect(ok).toBe(false);
    expect(error).toContain('não aceita o campo "foo"');
    expect(error).toContain("Campos aceitos:");
    expect(error).toContain("overdue");
  });

  it("rejeita valor fora do enum nomeando os aceitos", async () => {
    const { ok, result } = await runOrbTool("query_tasks", { status: "feito" }, ctx(fakeDb({})));
    const error = (result as { error: string }).error;

    expect(ok).toBe(false);
    expect(error).toContain("todo, doing, done");
    expect(error).toContain('Recebi "feito"');
  });

  it("rejeita campo obrigatório ausente nomeando o campo", async () => {
    const { ok, result } = await runOrbTool(
      "simulate_installment_impact",
      { installment_count: 12 },
      ctx(fakeDb({}))
    );
    const error = (result as { error: string }).error;

    expect(ok).toBe(false);
    expect(error).toContain('exige o campo "total_value"');
  });

  it("rejeita texto que não vira número", async () => {
    const { ok, result } = await runOrbTool(
      "query_transactions",
      { limit: "muitas" },
      ctx(fakeDb({}))
    );

    expect(ok).toBe(false);
    expect((result as { error: string }).error).toContain("precisa ser um número");
  });
});

/** Bug B4: sem deadline por tool, uma consulta pendurada segurava o turno inteiro. */
describe("timeout por tool (B4)", () => {
  it("interrompe a tool que nunca responde e devolve erro em vez de travar", async () => {
    const nuncaResponde: OrbTool = {
      name: "tool_de_teste_que_nunca_responde",
      description: "Tool falsa, registrada só durante este teste, cujo run nunca resolve.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: () => new Promise<never>(() => {}),
    };
    orbTools.push(nuncaResponde);
    vi.useFakeTimers();

    try {
      const execucao = runOrbTool(nuncaResponde.name, {}, ctx(fakeDb({})));
      await vi.advanceTimersByTimeAsync(ORB_TOOL_TIMEOUT_MS + 1_000);
      const { ok, result } = await execucao;

      expect(ok).toBe(false);
      expect((result as { error: string }).error).toContain("demorou demais");
      expect((result as { error: string }).error).toContain(nuncaResponde.name);
      expect(orbToolErrorCode(result)).toBe("timeout");
    } finally {
      vi.useRealTimers();
      orbTools.splice(orbTools.indexOf(nuncaResponde), 1);
    }
  });
});

/**
 * GUARD DE ESCOPO (2T.0, bug B16) — o teste que impede a Onda 2 de nascer quebrada.
 *
 * A lista de tabelas é LIDA do cabeçalho de `types.ts`, nunca redigitada aqui: se ela for
 * atualizada lá (é onde quem escreve uma tool nova vai ler a regra), o guard acompanha sozinho.
 */
const FONTE_TYPES = readFileSync(
  new URL("../../../../supabase/functions/_shared/orb/types.ts", import.meta.url),
  "utf8"
);

function tabelasSemUserId(fonte: string): string[] {
  // Fora das crases sobram só os nomes de tabela: as crases guardam nome de migration
  // (`20260806130500_trip_stops.sql`), que casaria com o mesmo formato snake_case.
  const semCrases = fonte.replace(/`[^`]*`/g, " ");
  const inicio = semCrases.indexOf("(b) Tabelas SEM coluna");
  const fim = semCrases.indexOf("Escope SEMPRE", inicio);
  if (inicio === -1 || fim === -1) return [];
  const nomes = semCrases.slice(inicio, fim).match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [];
  return [...new Set(nomes)];
}

/**
 * Linha genérica devolvida por QUALQUER tabela, para as tools chegarem até as leituras das
 * tabelas-filhas (`query_habits`, por exemplo, sai antes de ler `habit_log` quando não há hábito).
 *
 * Toda coluna daqui existe para DESTRAVAR um caminho: sem `start_date`/`end_date` a viagem-semente
 * não cobre data nenhuma e `query_trip_day_plan` volta antes de ler `trip_itinerary_day` e
 * `trip_itinerary_activity` — as duas tabelas do grupo (b) que só ela toca, e que ficavam fora do
 * guard sem ninguém notar. `deadline` e `type` são o mesmo caso em `query_upcoming`, que abortava
 * com `TypeError` no meio da coleta.
 */
const LINHA_GENERICA = {
  id: "seed-1",
  habit_id: "seed-1",
  trip_id: "seed-1",
  vehicle_id: "seed-1",
  name: "Semente",
  title: "Semente",
  status: "todo",
  completed: true,
  date: "2026-09-08",
  due_date: "2026-09-08",
  deadline: "2026-09-08",
  start_date: "2026-09-01",
  end_date: "2026-09-30",
  day_number: 1,
  type: "ipva",
  service_date: "2026-09-01",
  next_date: "2026-09-08",
  starts_at: "2026-09-08T12:00:00Z",
  value: 1,
  target_value: 1,
  current_value: 0,
};

/** Input mínimo que satisfaz o `required` de uma tool, para conseguir executá-la no guard. */
function entradaMinima(tool: OrbTool): Record<string, unknown> {
  const entrada: Record<string, unknown> = {};
  for (const campo of tool.inputSchema.required ?? []) {
    const schema = tool.inputSchema.properties[campo] as
      | { type?: string; enum?: unknown[] }
      | undefined;
    if (schema?.enum && schema.enum.length > 0) entrada[campo] = schema.enum[0];
    else if (schema?.type === "number" || schema?.type === "integer") entrada[campo] = 1;
    else if (schema?.type === "boolean") entrada[campo] = true;
    // Todo campo de texto obrigatório do app é data ou id; a data serve para os dois.
    else entrada[campo] = "2026-09-08";
  }
  return entrada;
}

/** Tabelas da lista que foram lidas com `.eq("user_id", …)` — a violação que o guard procura. */
function violacoesDeEscopo(log: Recorded[], semUserId: Set<string>): string[] {
  return log
    .filter((entry) => semUserId.has(entry.table))
    .filter((entry) => entry.filters.some(([chave]) => chave === "eq:user_id"))
    .map((entry) => entry.table);
}

describe("escopo por tabela (2T.0 / B16)", () => {
  it("lê a lista de tabelas sem user_id do cabeçalho de types.ts", () => {
    const tabelas = tabelasSemUserId(FONTE_TYPES);

    // Se o cabeçalho mudar de formato e a extração devolver pouco, o guard abaixo passaria à toa.
    expect(tabelas.length).toBeGreaterThanOrEqual(8);
    expect(tabelas).toContain("habit_log");
    expect(tabelas).toContain("trip_expense");
  });

  it("nenhuma tool filtra por user_id em tabela que não tem a coluna", async () => {
    const semUserId = new Set(tabelasSemUserId(FONTE_TYPES));
    const log: Recorded[] = [];
    const db = fakeDb({}, log, [LINHA_GENERICA]);

    for (const tool of orbTools) {
      await runOrbTool(tool.name, entradaMinima(tool), ctx(db));
    }

    // `.eq("user_id")` numa dessas dá 42703 em runtime, o `catch` do registry engole e o modelo
    // recebe "não consegui consultar" — falha silenciosa com cara de dado ausente.
    expect(violacoesDeEscopo(log, semUserId)).toEqual([]);
    // O guard só vale sobre a tabela que ele CHEGA a ler. Uma tool que volta cedo (viagem-semente
    // sem data cobrindo hoje, veículo-semente sem documento) tira a tabela-filha dela do alcance
    // sem quebrar nada — e o guard segue verde vigiando menos. A lista abaixo é o piso: se uma
    // mudança encurtar um desses caminhos, o teste cai em vez de emagrecer calado.
    const alcancadas = new Set(log.map((entry) => entry.table));
    for (const tabela of [
      "habit_log",
      "trip_expense",
      "trip_itinerary_day",
      "trip_itinerary_activity",
      "trip_milestone",
      "trip_stop",
      "vehicle_document",
      "vehicle_maintenance",
    ]) {
      expect(alcancadas.has(tabela), `o guard não chegou a ler ${tabela}`).toBe(true);
    }
  });

  it("pega a violação quando ela existe (controle positivo do guard)", async () => {
    const semUserId = new Set(tabelasSemUserId(FONTE_TYPES));
    const log: Recorded[] = [];
    const db = fakeDb({}, log, [LINHA_GENERICA]);
    // Exatamente o copiar-e-colar que a Onda 2 tende a produzir: o padrão `.eq("user_id")` das
    // tabelas do grupo (a) aplicado a uma tabela-filha, que não tem a coluna.
    const toolErrada: OrbTool = {
      name: "tool_de_teste_com_escopo_errado",
      description: "Tool falsa que consulta uma tabela-filha do jeito errado, só neste teste.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async (_input, contexto) => {
        await contexto.db.from("habit_log").select("id").eq("user_id", contexto.userId);
        return {};
      },
    };
    orbTools.push(toolErrada);

    try {
      await runOrbTool(toolErrada.name, {}, ctx(db));
    } finally {
      orbTools.splice(orbTools.indexOf(toolErrada), 1);
    }

    expect(violacoesDeEscopo(log, semUserId)).toEqual(["habit_log"]);
  });
});
