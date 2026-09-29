import { describe, expect, it } from "vitest";

import {
  resumoCurtoDeTool,
  resumoDeToolParaTabela,
  linhasCompactasVisiveis,
} from "@/domain/orb/toolSummary";

describe("toolSummary", () => {
  const categories = {
    categories: [
      { class_id: 1, class_name: "Combustível", nature: "Despesa", type_name: "Transporte" },
      { class_id: 2, class_name: "Mercado", nature: "Despesa", type_name: "Alimentação" },
    ],
  };

  it("vira tabela a partir de uma lista homogênea", () => {
    const tabela = resumoDeToolParaTabela(categories);
    expect(tabela?.colunas).toContain("class_name");
    expect(tabela?.linhas).toHaveLength(2);
  });

  it("resumo curto conta itens — nunca JSON", () => {
    expect(resumoCurtoDeTool(categories)).toBe("2 itens");
    expect(resumoCurtoDeTool(categories)).not.toMatch(/class_id/);
  });

  it("linhas compactas usam nome legível", () => {
    const tabela = resumoDeToolParaTabela(categories)!;
    const view = linhasCompactasVisiveis(tabela);
    expect(view.linhas[0]).toEqual({ titulo: "Combustível", meta: "Despesa" });
  });

  it("objeto sem lista não vira JSON no curto", () => {
    expect(resumoCurtoDeTool({ foo: 1, bar: 2 })).toBeNull();
    expect(resumoCurtoDeTool({ error: "Falhou a consulta." })).toBe("Falhou a consulta.");
  });
});
