import { describe, expect, it } from "vitest";

import { orbTools } from "../../../../supabase/functions/_shared/orb/registry.ts";
import {
  createOrbStreamParser,
  formatarDuracao,
  formatarTokens,
  resumoDeToolParaTabela,
} from "@/domain/orb/stream";
import { orbToolLabel } from "@/domain/orb/toolLabel";

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

describe("createOrbStreamParser", () => {
  it("entrega eventos completos de um chunk único", () => {
    const parser = createOrbStreamParser();
    const events = parser.push(
      sse({ type: "tool", name: "query_tasks", phase: "start" }) + sse({ type: "text", text: "Oi" })
    );

    expect(events).toEqual([
      { type: "tool", name: "query_tasks", phase: "start" },
      { type: "text", text: "Oi" },
    ]);
  });

  it("segura o evento partido no meio até o chunk seguinte", () => {
    const parser = createOrbStreamParser();
    const raw = sse({ type: "text", text: "orçamento" });
    const cut = Math.floor(raw.length / 2);

    expect(parser.push(raw.slice(0, cut))).toEqual([]);
    expect(parser.push(raw.slice(cut))).toEqual([{ type: "text", text: "orçamento" }]);
  });

  it("entrega no flush o último evento sem a linha em branco final", () => {
    const parser = createOrbStreamParser();

    expect(parser.push(`data: ${JSON.stringify({ type: "done" })}`)).toEqual([]);
    expect(parser.flush()).toEqual([{ type: "done" }]);
    // O buffer zera: um flush repetido não pode reemitir o mesmo evento.
    expect(parser.flush()).toEqual([]);
  });

  it("ignora keep-alive, comentário e JSON quebrado sem derrubar o resto", () => {
    const parser = createOrbStreamParser();
    const events = parser.push(
      "\n\n" + ": ping\n\n" + "data: {isso não é json}\n\n" + sse({ type: "text", text: "ok" })
    );

    expect(events).toEqual([{ type: "text", text: "ok" }]);
  });

  it("ignora evento de tipo desconhecido", () => {
    const parser = createOrbStreamParser();
    expect(parser.push(sse({ type: "proposal", id: "1" }))).toEqual([]);
  });
});

describe("orbToolLabel", () => {
  it("traduz o nome da tool para o rótulo da UI", () => {
    // O rótulo vem do `title` da própria tool no registro compartilhado, não de um mapa local.
    expect(orbToolLabel("query_budget_status")).toBe("Orçamento do mês");
  });

  it("acompanha o registro sem ninguém reescrever um mapa paralelo", () => {
    // A regressão que motivou a mudança: tool nova entrava no registro e a UI mostrava o `name`.
    for (const tool of orbTools) {
      expect(orbToolLabel(tool.name), `${tool.name} sem rótulo na UI`).toBe(tool.title ?? tool.name);
      expect(orbToolLabel(tool.name)).not.toBe(tool.name);
    }
  });

  it("cai para o nome cru numa tool ainda sem rótulo", () => {
    expect(orbToolLabel("query_alguma_coisa_nova")).toBe("query_alguma_coisa_nova");
  });
});

describe("resumoDeToolParaTabela", () => {
  it("acha a lista dentro do resumo da tool e devolve colunas e linhas alinhadas", () => {
    // Formato real de `query_transactions`: metadados soltos + UMA lista de objetos rasos.
    const tabela = resumoDeToolParaTabela({
      start_date: "2026-08-01",
      end_date: "2026-08-31",
      transactions: [
        { date: "2026-08-02", description: "Mercado", value: 320.5 },
        { date: "2026-08-04", description: "Uber", value: 27 },
      ],
    });

    expect(tabela).toEqual({
      colunas: ["date", "description", "value"],
      linhas: [
        ["2026-08-02", "Mercado", 320.5],
        ["2026-08-04", "Uber", 27],
      ],
    });
  });

  it("aceita o resumo que já é a lista", () => {
    expect(resumoDeToolParaTabela([{ nome: "Correr", feito: true }])).toEqual({
      colunas: ["nome", "feito"],
      linhas: [["Correr", true]],
    });
  });

  it("devolve null quando não dá tabela", () => {
    // Lista irregular viraria tabela com buraco silencioso.
    expect(
      resumoDeToolParaTabela([{ a: 1, b: 2 }, { a: 1 }])
    ).toBeNull();
    // Valor aninhado não cabe numa célula.
    expect(resumoDeToolParaTabela([{ a: 1, b: { c: 2 } }])).toBeNull();
    // Duas listas no mesmo objeto: qual delas seria a tabela?
    expect(resumoDeToolParaTabela({ x: [{ a: 1 }], y: [{ b: 2 }] })).toBeNull();
    // Resumo truncado pelo servidor não tem linha nenhuma.
    expect(resumoDeToolParaTabela({ truncated: true, itens: 340 })).toBeNull();
    expect(resumoDeToolParaTabela([])).toBeNull();
    expect(resumoDeToolParaTabela("nada")).toBeNull();
    expect(resumoDeToolParaTabela(null)).toBeNull();
  });
});

describe("formatarDuracao", () => {
  it("escolhe a unidade e usa vírgula decimal", () => {
    expect(formatarDuracao(0)).toBe("0 ms");
    expect(formatarDuracao(412)).toBe("412 ms");
    expect(formatarDuracao(1234)).toBe("1,2 s");
    expect(formatarDuracao(2000)).toBe("2 s");
    expect(formatarDuracao(65_000)).toBe("1 min 5 s");
    expect(formatarDuracao(120_000)).toBe("2 min");
    expect(formatarDuracao(119_600)).toBe("2 min");
  });

  it("devolve vazio para valor ausente ou inválido", () => {
    expect(formatarDuracao(undefined)).toBe("");
    expect(formatarDuracao(null)).toBe("");
    expect(formatarDuracao(-5)).toBe("");
    expect(formatarDuracao(Number.NaN)).toBe("");
  });
});

describe("formatarTokens", () => {
  it("resume a contagem para o rodapé de custo", () => {
    expect(formatarTokens(412)).toBe("412");
    expect(formatarTokens(1000)).toBe("1 mil");
    expect(formatarTokens(12_400)).toBe("12,4 mil");
    expect(formatarTokens(1_240_000)).toBe("1,2 mi");
    // Sem o corte antes de 1000, 999.960 tokens viravam "1.000 mil".
    expect(formatarTokens(999_960)).toBe("1 mi");
  });

  it("devolve vazio para valor ausente ou inválido", () => {
    expect(formatarTokens(undefined)).toBe("");
    expect(formatarTokens(null)).toBe("");
    expect(formatarTokens(-1)).toBe("");
  });
});
