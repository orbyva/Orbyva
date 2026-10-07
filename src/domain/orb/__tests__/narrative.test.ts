import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  humanizarErroDeTool,
  narrarPasso,
  narrarPassos,
  type OrbPassoDeTool,
} from "@/domain/orb/narrative";

function passo(patch: Partial<OrbPassoDeTool> = {}): OrbPassoDeTool {
  return { id: "t1", name: "query_tasks", status: "ok", ...patch };
}

const rotulo = (nome: string) => (nome === "query_nova" ? "Coisa nova" : nome);

describe("narrarPasso", () => {
  it("projeção de saldo vira compra, janela, veredito e base", () => {
    const narrado = narrarPasso(
      passo({
        name: "simulate_month_balance",
        input: { total_value: 5000, installment_count: 12, months: 12 },
        summary: {
          total_value: 5000,
          installment_count: 12,
          installment_value: 416.67,
          first_installment_month: "2026-10",
          last_installment_month: "2027-09",
          history_months: 3,
          months_with_negative_balance: 2,
          fits_every_month: false,
          worst_month: { ym: "2026-12", balance: -312.4 },
        },
      }),
      "Projeção de saldo mensal"
    );

    expect(narrado.titulo).toBe("Projetei seu saldo mês a mês");
    expect(narrado.detalhe).toMatch(/R\$\s*5\.000,00 em 12x de R\$\s*416,67, de out\/2026 a set\/2027/);
    expect(narrado.detalhe).toMatch(/2 meses ficam no vermelho \(pior: dez\/2026, -R\$\s*312,40\)/);
    expect(narrado.detalhe).toContain("base: média dos últimos 3 meses");
  });

  it("proposta de criação mostra o tipo, o título e o valor", () => {
    const narrado = narrarPasso(
      passo({
        name: "propose_create",
        input: { kind: "transaction", title: "Salário de Outubro", value: 4500 },
        summary: { kind: "transaction", label: "Novo lançamento", fields: [], payload: {} },
      }),
      "Criar (com confirmação)"
    );

    expect(narrado.titulo).toBe("Preparei o cartão para você confirmar");
    expect(narrado.detalhe).toMatch(/^Novo lançamento · Salário de Outubro · R\$\s*4\.500,00$/);
  });

  it("consulta comum conta os resultados e diz o período", () => {
    const narrado = narrarPasso(
      passo({
        name: "query_transactions",
        summary: {
          start_date: "2026-09-01",
          end_date: "2026-09-30",
          transactions: [{ id: 1 }, { id: 2 }, { id: 3 }],
        },
      }),
      "Lançamentos"
    );

    expect(narrado.titulo).toBe("Consultei seus lançamentos");
    expect(narrado.detalhe).toBe("3 resultados · de 01/09 a 30/09/2026");
  });

  it("enquanto roda, fala no gerúndio e sem detalhe", () => {
    const narrado = narrarPasso(passo({ status: "running" }), "Tarefas");
    expect(narrado.titulo).toBe("Consultando suas tarefas…");
    expect(narrado.detalhe).toBeNull();
  });

  it("tool sem frase própria usa o rótulo do registro, nunca o nome cru", () => {
    const narrado = narrarPasso(passo({ name: "query_nova", summary: { itens: [] } }), "Coisa nova");
    expect(narrado.titulo).toBe("Consultei “Coisa nova”");
    expect(narrado.detalhe).toBe("nada encontrado");
  });
});

describe("humanizarErroDeTool", () => {
  it("tira a instrução para o modelo e traduz o nome do campo", () => {
    expect(
      humanizarErroDeTool(
        'Para criar novo lançamento falta "title". Chame ask_user e só então propose_create de novo.'
      )
    ).toBe("Para criar novo lançamento falta o título.");
  });

  it("não quebra frase em ponto de milhar", () => {
    expect(humanizarErroDeTool("O limite é R$ 1.000,00 por mês.")).toBe(
      "O limite é R$ 1.000,00 por mês."
    );
  });

  it("devolve null quando só sobra jargão", () => {
    expect(humanizarErroDeTool("Use query_data com count_only.")).toBeNull();
  });
});

describe("narrarPassos", () => {
  it("falha refeita com sucesso na mesma tool vira 'ajustei e tentei de novo'", () => {
    const [primeira, segunda] = narrarPassos(
      [
        passo({
          id: "a",
          name: "propose_create",
          status: "error",
          summary: {
            error: 'Para criar novo lançamento falta "title". Chame ask_user e só então propose_create de novo.',
          },
        }),
        passo({ id: "b", name: "propose_create", status: "ok", summary: { label: "Novo lançamento" } }),
      ],
      rotulo
    );

    expect(primeira.corrigido).toBe(true);
    expect(primeira.titulo).toBe("Ajustei o pedido e tentei de novo");
    expect(primeira.detalhe).toBe("Na primeira tentativa: para criar novo lançamento falta o título.");
    expect(segunda.corrigido).toBe(false);
  });

  it("falha sem nova tentativa continua sendo falha, com o motivo legível", () => {
    const [unica] = narrarPassos(
      [
        passo({
          name: "propose_create",
          status: "error",
          summary: { error: 'Para criar novo evento falta "date". Pergunte ao usuário e chame de novo.' },
        }),
      ],
      rotulo
    );

    expect(unica.corrigido).toBe(false);
    expect(unica.titulo).toBe("Faltou informação para preparar o cartão");
    expect(unica.detalhe).toBe("Para criar novo evento falta a data.");
  });
});

describe("cópia do mobile", () => {
  it("é idêntica à do web", () => {
    const raiz = resolve(__dirname, "../../../..");
    const web = readFileSync(resolve(raiz, "src/domain/orb/narrative.ts"), "utf8");
    const mobile = readFileSync(resolve(raiz, "mobile/src/domain/orb/narrative.ts"), "utf8");
    expect(mobile).toBe(web);
  });
});
