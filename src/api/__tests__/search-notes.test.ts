import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_KIND_LABEL, searchGlobal } from "@/api/search";

/**
 * Busca global encontrando notas (feature 055). O Supabase é substituído por um duplo que registra
 * qual tabela/colunas cada ramo do fan-out consultou e devolve linhas — é o que prova, sem
 * navegador, que buscar um trecho que só existe dentro de uma nota devolve um hit apontando para o
 * editor certo (`/notes/<id>`).
 */

interface Query {
  table: string;
  columns: string;
  or?: string;
  eq: [string, unknown][];
}

const queries: Query[] = [];
const rowsByTable: Record<string, unknown[]> = {};

function makeBuilder(table: string) {
  const query: Query = { table, columns: "", eq: [] };
  queries.push(query);
  const builder = {
    select(columns: string) {
      query.columns = columns;
      return builder;
    },
    eq(column: string, value: unknown) {
      query.eq.push([column, value]);
      return builder;
    },
    or(expr: string) {
      query.or = expr;
      return builder;
    },
    limit() {
      return Promise.resolve({ data: rowsByTable[table] ?? [], error: null });
    },
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => makeBuilder(table) },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/api/finance", () => ({
  fetchTransactionsQuery: vi.fn(async () => ({ data: [] })),
}));

beforeEach(() => {
  queries.length = 0;
  for (const key of Object.keys(rowsByTable)) delete rowsByTable[key];
});

function noteQuery(): Query {
  return queries.find((q) => q.table === "note")!;
}

describe("searchGlobal — notas", () => {
  it("consulta a tabela note escopada no usuário, com ilike em title e content", async () => {
    await searchGlobal("cimento");

    const q = noteQuery();
    expect(q).toBeDefined();
    expect(q.eq).toEqual([["user_id", "user-1"]]);
    expect(q.or).toContain("title.ilike.");
    expect(q.or).toContain("content.ilike.");
    expect(q.columns).toContain("title");
    expect(q.columns).toContain("content");
  });

  it("um trecho que só existe no corpo da nota devolve o hit apontando para o editor", async () => {
    rowsByTable.note = [
      {
        id: "n1",
        title: "Reforma",
        content: "# Reforma\n\n- comprar **cimento** na terça",
        updated_at: "2026-08-16T12:00:00Z",
      },
    ];

    const hits = await searchGlobal("cimento");
    const hit = hits.find((h) => h.kind === "note")!;

    expect(hit).toBeDefined();
    expect(hit.id).toBe("note-n1");
    expect(hit.title).toBe("Reforma");
    expect(hit.href).toBe("/notes/n1");
    // O subtítulo é o excerpt: sem `#`, sem `-` de lista e sem `**`.
    expect(hit.subtitle).toBe("comprar cimento na terça");
  });

  // Feature 058: canvas mora na mesma tabela, logo cai na mesma busca — de graça.
  it("acha um canvas pelo título e leva para o editor dele", async () => {
    rowsByTable.note = [
      {
        id: "c1",
        title: "Arquitetura do sistema",
        content: "",
        kind: "canvas",
        updated_at: "2026-08-16T12:00:00Z",
      },
    ];

    const hit = (await searchGlobal("arquitetura")).find((h) => h.kind === "note")!;

    expect(hit.title).toBe("Arquitetura do sistema");
    expect(hit.href).toBe("/notes/c1");
    // Canvas não tem corpo de onde tirar excerpt: o subtítulo diz o que ele é.
    expect(hit.subtitle).toBe("Canvas");
  });

  it("nota sem corpo vira hit sem subtítulo, não com string vazia", async () => {
    rowsByTable.note = [{ id: "n2", title: "Só o título", content: "" }];

    const hit = (await searchGlobal("titulo")).find((h) => h.kind === "note")!;
    expect(hit.subtitle).toBeUndefined();
  });

  it("consulta curta demais não vai ao banco", async () => {
    expect(await searchGlobal("a")).toEqual([]);
    expect(queries).toHaveLength(0);
  });

  it("o rótulo do tipo aparece na UI da busca", () => {
    expect(SEARCH_KIND_LABEL.note).toBe("Nota");
  });
});
