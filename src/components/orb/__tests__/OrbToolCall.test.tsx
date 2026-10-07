import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { OrbReasoning, OrbToolCall } from "@/components/orb/OrbToolCall";
import type { OrbToolCall as ChamadaDeTool } from "@/types/orb";

function chamada(patch: Partial<ChamadaDeTool> = {}): ChamadaDeTool {
  return {
    id: "t1",
    name: "query_spend_by_category",
    status: "ok",
    ...patch,
  };
}

function detalhesTecnicos() {
  return screen.getByRole("button", { name: /detalhes técnicos/i });
}

describe("OrbToolCall", () => {
  it("fecha em uma frase em português, com o número que importa e a duração", () => {
    render(
      <OrbToolCall
        tool={chamada({
          durationMs: 412,
          summary: { start_date: "2026-09-01", end_date: "2026-09-30", total_expense: 1560.5 },
        })}
      />
    );

    expect(screen.getByText("Somei seus gastos por categoria")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*1\.560,50 em despesas · de 01\/09 a 30\/09\/2026/)).toBeInTheDocument();
    // O nome técnico só aparece depois de abrir os detalhes.
    expect(screen.queryByText("query_spend_by_category")).not.toBeInTheDocument();
    expect(detalhesTecnicos()).toHaveAttribute("aria-expanded", "false");
    expect(detalhesTecnicos()).toHaveTextContent("412 ms");
    // Estado não pode ser só cor: o rótulo existe para o leitor de tela.
    expect(screen.getByText(/Concluída/)).toBeInTheDocument();
  });

  it("detalhes técnicos mostram ferramenta, parâmetros e resultado em tabela, com dinheiro em BRL", async () => {
    const user = userEvent.setup();
    render(
      <OrbToolCall
        tool={chamada({
          input: { start_date: "2026-09-01", end_date: "2026-09-30" },
          summary: {
            start_date: "2026-09-01",
            breakdown: [
              { type: "Alimentação", total: 1240.5, transaction_count: 12 },
              { type: "Transporte", total: 320, transaction_count: 4 },
            ],
          },
        })}
      />
    );

    await user.click(detalhesTecnicos());

    expect(detalhesTecnicos()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("query_spend_by_category")).toBeInTheDocument();
    expect(screen.getByText("Parâmetros")).toBeInTheDocument();
    // Parâmetro de data ISO sai em dd/mm/aaaa.
    expect(screen.getByText("01/09/2026")).toBeInTheDocument();

    const tabela = screen.getByRole("table");
    expect(tabela).toHaveTextContent("Alimentação");
    expect(screen.getByText(/R\$\s*1\.240,50/)).toBeInTheDocument();
    // `transaction_count` é número, não dinheiro: não pode virar "R$ 12,00".
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByText(/R\$\s*12,00/)).not.toBeInTheDocument();
  });

  it("corta a tabela em 20 linhas e diz quantas ficaram de fora", async () => {
    const user = userEvent.setup();
    const linhas = Array.from({ length: 25 }, (_, i) => ({ nome: `Item ${i}`, valor: i }));
    render(<OrbToolCall tool={chamada({ name: "query_tasks", summary: { itens: linhas } })} />);

    expect(screen.getByText("25 resultados")).toBeInTheDocument();
    await user.click(detalhesTecnicos());

    expect(screen.getAllByRole("row")).toHaveLength(21); // 20 linhas + cabeçalho
    expect(screen.getByText("+5 linhas não exibidas")).toBeInTheDocument();
  });

  it("falha diz o que não deu certo, em âmbar e não em vermelho", () => {
    const { container } = render(
      <OrbToolCall tool={chamada({ name: "query_tasks", status: "error" })} />
    );

    expect(screen.getByText("Não consegui consultar suas tarefas")).toBeInTheDocument();
    expect(screen.getByText(/Falhou/)).toBeInTheDocument();
    expect(container.innerHTML).toContain("border-warning/40");
    expect(container.innerHTML).not.toContain("destructive");
  });

  it("cai no JSON quando o resumo não é tabelável", async () => {
    const user = userEvent.setup();
    render(<OrbToolCall tool={chamada({ summary: { truncated: true, itens: 320 } })} />);

    await user.click(detalhesTecnicos());

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/"truncated": true/)).toBeInTheDocument();
  });
});

describe("OrbReasoning", () => {
  it("lista os passos em ordem como linha de raciocínio e recolhe num clique", async () => {
    const user = userEvent.setup();
    render(
      <OrbReasoning
        tools={[
          chamada({ id: "a", name: "query_finance_categories", summary: { categories: [{ id: 1 }] } }),
          chamada({
            id: "b",
            name: "simulate_installment_impact",
            summary: {
              total_value: 5000,
              installment_count: 12,
              installment_value: 416.67,
              balance_after_installment: -484.77,
              history_months: 3,
            },
          }),
        ]}
      />
    );

    const cabecalho = screen.getByRole("button", { name: /Linha de raciocínio · 2 passos/ });
    expect(cabecalho).toHaveAttribute("aria-expanded", "true");

    const passos = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(passos).toHaveLength(2);
    expect(passos[0]).toHaveTextContent("Consultei suas categorias financeiras");
    expect(passos[1]).toHaveTextContent("Simulei o parcelamento");
    expect(passos[1]).toHaveTextContent(/R\$\s*5\.000,00 em 12x de R\$\s*416,67/);
    expect(passos[1]).toHaveTextContent(/sobra média depois da parcela: -R\$\s*484,77\/mês/);

    await user.click(cabecalho);
    expect(cabecalho).toHaveAttribute("aria-expanded", "false");
  });

  it("criação refeita com sucesso aparece como ajuste, não como falha", () => {
    render(
      <OrbReasoning
        tools={[
          chamada({
            id: "a",
            name: "propose_create",
            status: "error",
            summary: {
              error: 'Para criar novo lançamento falta "title". Chame ask_user e só então propose_create de novo.',
            },
          }),
          chamada({ id: "b", name: "propose_create", summary: { label: "Novo lançamento" } }),
        ]}
      />
    );

    expect(screen.getByText("Ajustei o pedido e tentei de novo")).toBeInTheDocument();
    expect(screen.queryByText(/Falhou/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ask_user/)).not.toBeInTheDocument();
    expect(screen.getByText("Preparei o cartão para você confirmar")).toBeInTheDocument();
  });

  it("enquanto alguma consulta roda, o cabeçalho diz que está pensando", () => {
    render(<OrbReasoning tools={[chamada({ name: "query_tasks", status: "running" })]} />);
    expect(screen.getByRole("button", { name: /Pensando · 1 passo/ })).toBeInTheDocument();
    expect(screen.getByText("Consultando suas tarefas…")).toBeInTheDocument();
  });
});
