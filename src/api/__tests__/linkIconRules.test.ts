// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  createLinkIconRule,
  deleteLinkIconRule,
  fetchLinkIconRules,
  reorderLinkIconRules,
  updateLinkIconRule,
} from "@/api/tasks/linkIconRules";
import { invalidateLinkIconRules, useLinkIconRules } from "@/hooks/useLinkIconRules";
import type { LinkIconRule, LinkIconRuleDraft } from "@/types/tasks";

/**
 * I/O das regras de ícone de link (feature 087), verificado com o mesmo duplo de query builder de
 * `src/api/__tests__/iconAssets.test.ts` — sem Supabase local, o que se afirma é a query montada:
 * tabela, filtros e payload.
 *
 * Duas coisas aqui não são detalhe de I/O e sim o mecanismo da feature: a leitura sai **ordenada
 * por `position`** (é a ordem em que as regras são avaliadas, e a primeira que casa vence) e
 * `reorderLinkIconRules` grava as posições em sequência — é a única forma de mudar a precedência.
 * A terceira é defesa: `pattern` é entrada do usuário que vira `new RegExp`, e nenhuma escrita pode
 * levar ao banco uma regex que não compila ou maior que o teto.
 */

interface Call {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  eq: [string, unknown][];
  order?: [string, { ascending: boolean }];
}

const calls: Call[] = [];
let results: { data: unknown; error: { message: string } | null }[] = [];

function nextResult() {
  return results.length > 1
    ? (results.shift() as { data: unknown; error: { message: string } | null })
    : results[0];
}

function makeBuilder(table: string) {
  const call: Call = { table, op: "select", eq: [] };
  calls.push(call);
  const builder = {
    select() {
      return builder;
    },
    insert(payload: unknown) {
      call.op = "insert";
      call.payload = payload;
      return builder;
    },
    update(payload: unknown) {
      call.op = "update";
      call.payload = payload;
      return builder;
    },
    delete() {
      call.op = "delete";
      return builder;
    },
    eq(column: string, value: unknown) {
      call.eq.push([column, value]);
      return builder;
    },
    order(column: string, options: { ascending: boolean }) {
      call.order = [column, options];
      return Promise.resolve(nextResult());
    },
    single() {
      return Promise.resolve(nextResult());
    },
    then(
      resolve: (value: ReturnType<typeof nextResult>) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve(nextResult()).then(resolve, reject);
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
  results = [{ data: [], error: null }];
});

const RULE: LinkIconRule = {
  id: "rule-1",
  user_id: "user-1",
  name: "GitHub issue",
  pattern: "^https?://github\\.com/([^/]+)/([^/]+)/issues/(\\d+)",
  label_template: "$1/$2#$3",
  icon_key: "github",
  icon_url: null,
  position: 0,
  enabled: true,
  created_at: "2026-08-23T00:00:00Z",
};

function draft(over: Partial<LinkIconRuleDraft> = {}): LinkIconRuleDraft {
  return {
    name: "GitHub issue",
    pattern: RULE.pattern,
    label_template: "$1/$2#$3",
    icon_key: "github",
    icon_url: null,
    position: 0,
    enabled: true,
    ...over,
  };
}

describe("api/linkIconRules — leitura", () => {
  it("lê as regras do usuário na ordem de avaliação (`position` crescente)", async () => {
    results = [{ data: [RULE], error: null }];

    await expect(fetchLinkIconRules()).resolves.toEqual([RULE]);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("link_icon_rule");
    // O filtro por user_id não é redundante com a RLS: é ele que casa com o índice
    // `link_icon_rule_user_position_idx`, que começa por user_id.
    expect(calls[0].eq).toEqual([["user_id", "user-1"]]);
    expect(calls[0].order).toEqual(["position", { ascending: true }]);
  });

  it("propaga o erro do PostgREST em vez de devolver lista vazia silenciosa", async () => {
    results = [{ data: null, error: { message: "falha de rede" } }];
    await expect(fetchLinkIconRules()).rejects.toThrow("falha de rede");
  });
});

describe("api/linkIconRules — escrita", () => {
  it("cria a regra com o user_id do dono, aparando nome, pattern e template", async () => {
    results = [{ data: RULE, error: null }];

    await createLinkIconRule(draft({ name: "  GitHub issue  ", label_template: "  $1/$2#$3  " }));

    expect(calls[0].op).toBe("insert");
    expect(calls[0].table).toBe("link_icon_rule");
    expect(calls[0].payload).toEqual([
      {
        user_id: "user-1",
        name: "GitHub issue",
        pattern: RULE.pattern,
        label_template: "$1/$2#$3",
        icon_key: "github",
        icon_url: null,
        position: 0,
        enabled: true,
      },
    ]);
  });

  it("template só com espaços vira null — quem decide o fallback é o domínio, não uma string vazia", async () => {
    results = [{ data: RULE, error: null }];
    await createLinkIconRule(draft({ label_template: "   " }));
    expect((calls[0].payload as Record<string, unknown>[])[0].label_template).toBeNull();
  });

  it("ícone da biblioteca zera o preset (mutuamente exclusivos, como em `task`)", async () => {
    results = [{ data: RULE, error: null }];
    await createLinkIconRule(draft({ icon_key: "star", icon_url: "https://cdn.test/gh.svg" }));
    expect((calls[0].payload as Record<string, unknown>[])[0]).toMatchObject({
      icon_key: null,
      icon_url: "https://cdn.test/gh.svg",
    });
  });

  it("regex que não compila não chega ao banco", async () => {
    await expect(createLinkIconRule(draft({ pattern: "([unclosed" }))).rejects.toThrow(
      /regular expression/i
    );
    expect(calls).toHaveLength(0);
  });

  it("pattern acima do teto não chega ao banco", async () => {
    await expect(createLinkIconRule(draft({ pattern: "a".repeat(201) }))).rejects.toThrow(
      "200 caracteres"
    );
    expect(calls).toHaveLength(0);
  });

  it("regra sem nome não chega ao banco (a coluna é not null)", async () => {
    await expect(createLinkIconRule(draft({ name: "   " }))).rejects.toThrow(
      "A regra precisa de um nome."
    );
    expect(calls).toHaveLength(0);
  });

  it("atualiza só os campos mandados, escopado no id e no usuário", async () => {
    await updateLinkIconRule("rule-1", { enabled: false });

    expect(calls[0].op).toBe("update");
    expect(calls[0].payload).toEqual({ enabled: false });
    expect(calls[0].eq).toEqual([
      ["id", "rule-1"],
      ["user_id", "user-1"],
    ]);
  });

  it("revalida a pattern no update — editar uma regra boa para uma quebrada não passa", async () => {
    await expect(updateLinkIconRule("rule-1", { pattern: "([unclosed" })).rejects.toThrow(
      /regular expression/i
    );
    expect(calls).toHaveLength(0);
  });

  it("exclui escopado no id e no usuário", async () => {
    await deleteLinkIconRule("rule-1");

    expect(calls[0].op).toBe("delete");
    expect(calls[0].table).toBe("link_icon_rule");
    expect(calls[0].eq).toEqual([
      ["id", "rule-1"],
      ["user_id", "user-1"],
    ]);
  });
});

describe("api/linkIconRules — reordenar é o que decide a precedência", () => {
  it("grava as posições em sequência, na ordem dos ids", async () => {
    await reorderLinkIconRules(["rule-c", "rule-a", "rule-b"]);

    expect(calls).toHaveLength(3);
    expect(calls.map((call) => [call.eq[0][1], call.payload])).toEqual([
      ["rule-c", { position: 0 }],
      ["rule-a", { position: 1 }],
      ["rule-b", { position: 2 }],
    ]);
    for (const call of calls) {
      expect(call.op).toBe("update");
      expect(call.table).toBe("link_icon_rule");
      expect(call.eq[1]).toEqual(["user_id", "user-1"]);
    }
  });

  it("para no primeiro erro em vez de deixar a ordem pela metade sem avisar", async () => {
    results = [
      { data: null, error: null },
      { data: null, error: { message: "conflito" } },
      { data: null, error: null },
    ];

    await expect(reorderLinkIconRules(["a", "b", "c"])).rejects.toThrow("conflito");
    expect(calls).toHaveLength(2);
  });
});

describe("useLinkIconRules — cache no módulo", () => {
  beforeEach(() => {
    // O cache vive no módulo e sobreviveria de um teste para o outro.
    invalidateLinkIconRules();
  });

  it("busca uma vez, reusa na segunda montagem e refaz só depois de invalidate()", async () => {
    results = [{ data: [RULE], error: null }];

    const primeira = renderHook(() => useLinkIconRules());
    await waitFor(() => expect(primeira.result.current).toEqual([RULE]));
    expect(calls).toHaveLength(1);
    primeira.unmount();

    // Segunda montagem (outro card da lista): sai do cache, sem consulta nova.
    const segunda = renderHook(() => useLinkIconRules());
    await waitFor(() => expect(segunda.result.current).toEqual([RULE]));
    expect(calls).toHaveLength(1);

    // Salvar na tela de configuração invalida — e o consumidor **montado** busca de novo.
    results = [{ data: [{ ...RULE, label_template: "novo" }], error: null }];
    act(() => invalidateLinkIconRules());
    await waitFor(() => expect(calls).toHaveLength(2));
    await waitFor(() => expect(segunda.result.current[0].label_template).toBe("novo"));
    segunda.unmount();
  });

  it("várias montagens simultâneas compartilham uma consulta só", async () => {
    results = [{ data: [RULE], error: null }];

    const a = renderHook(() => useLinkIconRules());
    const b = renderHook(() => useLinkIconRules());
    await waitFor(() => expect(a.result.current).toEqual([RULE]));
    await waitFor(() => expect(b.result.current).toEqual([RULE]));

    expect(calls).toHaveLength(1);
    a.unmount();
    b.unmount();
  });

  it("falha de carregamento resolve para lista vazia — sem lançar e sem toast", async () => {
    results = [{ data: null, error: { message: "500" } }];
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result, unmount } = renderHook(() => useLinkIconRules());
    await waitFor(() => expect(logged).toHaveBeenCalled());

    // Lista vazia = todo link cai no fallback de host. A aparência piora, a tela não quebra.
    expect(result.current).toEqual([]);
    logged.mockRestore();
    unmount();
  });
});
