import { describe, expect, it } from "vitest";

import { runOrbTool } from "../../../../supabase/functions/_shared/orb/registry.ts";
import {
  findOrbTable,
  ORB_TABLES,
} from "../../../../supabase/functions/_shared/orb/schema.ts";
import { fakeDb, type Recorded } from "./fakeDb";

const ctx = (db: ReturnType<typeof fakeDb>) => ({
  db,
  userId: "user-1",
  today: "2026-09-10",
  timezone: "America/Sao_Paulo",
});

function filtros(entry: Recorded): string[] {
  return entry.filters.map(([chave]) => String(chave));
}

describe("catálogo do banco", () => {
  it("não repete tabela nem coluna, e toda coluna padrão existe", () => {
    const nomes = ORB_TABLES.map((tabela) => tabela.name);
    expect(new Set(nomes).size).toBe(nomes.length);

    for (const tabela of ORB_TABLES) {
      const colunas = tabela.columns.map((coluna) => coluna.name);
      expect(new Set(colunas).size).toBe(colunas.length);
      for (const padrao of tabela.defaultColumns) expect(colunas).toContain(padrao);
      if (tabela.defaultOrder) expect(colunas).toContain(tabela.defaultOrder.column);
    }
  });

  it("declara escopo por pai só em tabela sem user_id, e a coluna do pai existe", () => {
    for (const tabela of ORB_TABLES) {
      if (tabela.scope.kind !== "parent") continue;
      const colunas = tabela.columns.map((coluna) => coluna.name);
      expect(colunas).toContain(tabela.scope.column);
      expect(colunas).not.toContain("user_id");
    }
  });

  it("toda referência aponta para uma tabela do catálogo", () => {
    const nomes = new Set(ORB_TABLES.map((tabela) => tabela.name));
    for (const tabela of ORB_TABLES) {
      for (const coluna of tabela.columns) {
        if (coluna.references) expect(nomes.has(coluna.references)).toBe(true);
      }
    }
  });
});

describe("describe_data", () => {
  it("sem argumento lista as tabelas", async () => {
    const { ok, result } = await runOrbTool("describe_data", {}, ctx(fakeDb({})));
    expect(ok).toBe(true);
    const tabelas = (result as { tables: unknown[] }).tables;
    expect(tabelas.length).toBe(ORB_TABLES.length);
  });

  it("com tabela devolve colunas, escopo e a tool preferida", async () => {
    const { result } = await runOrbTool("describe_data", { table: "task" }, ctx(fakeDb({})));
    expect(result).toMatchObject({ table: "task", prefer_tool: "query_tasks" });
    const colunas = (result as { columns: { name: string }[] }).columns.map((c) => c.name);
    expect(colunas).toContain("due_date");
  });

  it("recusa tabela desconhecida", async () => {
    const { ok, result } = await runOrbTool("describe_data", { table: "auth_users" }, ctx(fakeDb({})));
    expect(ok).toBe(false);
    expect((result as { code: string }).code).toBe("input_invalido");
  });
});

describe("query_data", () => {
  it("escopa por user_id, aplica filtros e pagina", async () => {
    const log: Recorded[] = [];
    const db = fakeDb({ task: [{ id: "t-1", title: "Pintar" }] }, log);
    const { ok, result } = await runOrbTool(
      "query_data",
      {
        table: "task",
        columns: ["id", "title", "due_date"],
        filters: [
          { column: "status", op: "eq", value: "todo" },
          { column: "due_date", op: "lte", value: "2026-09-30" },
          { column: "project_id", op: "not_null" },
        ],
        order_by: "due_date",
        limit: 5,
      },
      ctx(db)
    );

    expect(ok).toBe(true);
    expect(result).toMatchObject({ table: "task", columns: ["id", "title", "due_date"] });
    const chaves = filtros(log[0]);
    expect(chaves).toContain("eq:user_id");
    expect(chaves).toContain("eq:status");
    expect(chaves).toContain("lte:due_date");
    expect(chaves).toContain("not:project_id");
    expect(chaves).toContain("order:due_date");
    expect(log[0].filters).toContainEqual(["range", [0, 4]]);
  });

  it("conta sem baixar linha", async () => {
    const log: Recorded[] = [];
    const db = fakeDb({ task: [] }, log);
    const { ok, result } = await runOrbTool(
      "query_data",
      { table: "task", count_only: true, filters: [{ column: "status", op: "eq", value: "done" }] },
      ctx(db)
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({ table: "task", filters_applied: 1 });
    // `head: true` pede só o cabeçalho de contagem — e sem `range`, que baixaria linhas.
    expect(log[0].filters[0]).toEqual(["select:id, title, status, due_date, priority, project_id", { count: "exact", head: true }]);
    expect(filtros(log[0])).not.toContain("range");
  });

  it("escopa tabela-filha pelo pai, nunca por user_id", async () => {
    const log: Recorded[] = [];
    const db = fakeDb({ habit: [{ id: "h-1" }], habit_log: [{ id: "l-1" }] }, log);
    const { ok } = await runOrbTool("query_data", { table: "habit_log" }, ctx(db));

    expect(ok).toBe(true);
    const leitura = log.find((entry) => entry.table === "habit_log")!;
    expect(filtros(leitura)).toContain("in:habit_id");
    expect(filtros(leitura)).not.toContain("eq:user_id");
  });

  it("recusa coluna que não existe, dizendo quais existem", async () => {
    const { ok, result } = await runOrbTool(
      "query_data",
      { table: "task", columns: ["titulo"] },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toContain("não tem a coluna");
  });

  it("recusa valor fora do enum da coluna", async () => {
    const { ok, result } = await runOrbTool(
      "query_data",
      { table: "task", filters: [{ column: "status", op: "eq", value: "pendente" }] },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toContain("todo, doing, done");
  });

  it("recusa operador inventado", async () => {
    const { ok } = await runOrbTool(
      "query_data",
      { table: "task", filters: [{ column: "title", op: "regex", value: ".*" }] },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(false);
  });

  it("avisa quando a página encheu, em vez de fingir que era tudo", async () => {
    const linhas = Array.from({ length: 3 }, (_, i) => ({ id: `t-${i}` }));
    const { result } = await runOrbTool(
      "query_data",
      { table: "task", limit: 3 },
      ctx(fakeDb({ task: linhas }))
    );
    expect(result).toMatchObject({ truncated: true });
    expect(String((result as { truncated_warning: string }).truncated_warning)).toContain("offset 3");
  });

  it("a tabela global não ganha filtro de dono", async () => {
    const log: Recorded[] = [];
    await runOrbTool("query_data", { table: "nature" }, ctx(fakeDb({ nature: [] }, log)));
    expect(filtros(log[0])).not.toContain("eq:user_id");
    expect(findOrbTable("nature")?.scope.kind).toBe("global");
  });
});
