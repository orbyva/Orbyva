// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEventTypeIcon,
  fetchEventTypeIcons,
  isMissingEventTypeIconSchema,
  setEventTypeIcon,
} from "@/api/travel/eventTypeIcons";

/**
 * I/O da personalização de ícone por tipo (feature 258), com o mesmo duplo de query builder dos
 * outros testes de API — sem Supabase local, o que se afirma é a query montada (tabela, filtros,
 * payload).
 *
 * Duas afirmações aqui são decisão da feature, não detalhe de I/O:
 *   1. gravar é **upsert** por `(user_id, category)` — um tipo nunca acumula duas linhas;
 *   2. com a migration ausente, a leitura devolve `{}` em vez de derrubar o roteiro.
 */

interface Call {
  table: string;
  op: "select" | "upsert" | "delete";
  payload?: unknown;
  options?: unknown;
  eq: [string, unknown][];
}

const calls: Call[] = [];
let result: { data: unknown; error: { message: string; code?: string } | null } = {
  data: [],
  error: null,
};

function makeBuilder(table: string) {
  const call: Call = { table, op: "select", eq: [] };
  calls.push(call);
  const builder = {
    select() {
      return builder;
    },
    upsert(payload: unknown, options: unknown) {
      call.op = "upsert";
      call.payload = payload;
      call.options = options;
      return Promise.resolve(result);
    },
    delete() {
      call.op = "delete";
      return builder;
    },
    eq(column: string, value: unknown) {
      call.eq.push([column, value]);
      return builder;
    },
    then(
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(result).then(resolve, reject);
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

beforeEach(() => {
  calls.length = 0;
  result = { data: [], error: null };
});

describe("fetchEventTypeIcons", () => {
  it("filtra por user_id e devolve o mapa indexado por categoria", async () => {
    result = {
      data: [
        { id: "1", user_id: "user-1", category: "museum", icon_key: "star", icon_url: null },
        {
          id: "2",
          user_id: "user-1",
          category: "bar",
          icon_key: null,
          icon_url: "https://cdn.test/mic.svg",
        },
      ],
      error: null,
    };

    const map = await fetchEventTypeIcons();

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("event_type_icon");
    expect(calls[0].eq).toEqual([["user_id", "user-1"]]);
    expect(map).toEqual({
      museum: { icon_key: "star", icon_url: null },
      bar: { icon_key: null, icon_url: "https://cdn.test/mic.svg" },
    });
  });

  it("migration ausente devolve mapa vazio em vez de derrubar o roteiro", async () => {
    result = { data: null, error: { message: 'relation "event_type_icon" does not exist', code: "42P01" } };
    await expect(fetchEventTypeIcons()).resolves.toEqual({});
  });

  it("erro de verdade continua subindo", async () => {
    result = { data: null, error: { message: "boom", code: "500" } };
    await expect(fetchEventTypeIcons()).rejects.toThrow("boom");
  });

  it("isMissingEventTypeIconSchema reconhece só a ausência de schema", () => {
    expect(isMissingEventTypeIconSchema({ code: "PGRST205" })).toBe(true);
    expect(isMissingEventTypeIconSchema({ message: "no table event_type_icon" })).toBe(true);
    expect(isMissingEventTypeIconSchema({ message: "permission denied" })).toBe(false);
    expect(isMissingEventTypeIconSchema(null)).toBe(false);
  });
});

describe("setEventTypeIcon", () => {
  it("grava por upsert em (user_id, category) — um tipo nunca acumula duas linhas", async () => {
    await setEventTypeIcon("museum", { icon_key: "star", icon_url: null });

    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("upsert");
    expect(calls[0].payload).toEqual({
      user_id: "user-1",
      category: "museum",
      icon_key: "star",
      icon_url: null,
    });
    expect(calls[0].options).toEqual({ onConflict: "user_id,category" });
  });

  it("com URL, o preset não vai junto — as colunas são mutuamente exclusivas", async () => {
    await setEventTypeIcon("bar", {
      icon_key: "star",
      icon_url: "https://cdn.test/mic.svg",
    });
    expect(calls[0].payload).toEqual({
      user_id: "user-1",
      category: "bar",
      icon_key: null,
      icon_url: "https://cdn.test/mic.svg",
    });
  });

  it("sem ícone nenhum recusa antes do banco, dizendo o que fazer", async () => {
    await expect(
      setEventTypeIcon("cafe", { icon_key: null, icon_url: null })
    ).rejects.toThrow(/remova a personalização/i);
    expect(calls).toHaveLength(0);
  });
});

describe("clearEventTypeIcon", () => {
  it("apaga a linha do tipo (sem linha é o único jeito de dizer 'sem personalização')", async () => {
    await clearEventTypeIcon("museum");

    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("delete");
    expect(calls[0].eq).toEqual([
      ["user_id", "user-1"],
      ["category", "museum"],
    ]);
  });
});
