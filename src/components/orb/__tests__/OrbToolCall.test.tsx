import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { OrbToolCall } from "@/components/orb/OrbToolCall";
import type { OrbToolCall as ChamadaDeTool } from "@/types/orb";

function chamada(patch: Partial<ChamadaDeTool> = {}): ChamadaDeTool {
  return {
    id: "t1",
    name: "query_spend_by_category",
    status: "ok",
    ...patch,
  };
}

describe("OrbToolCall", () => {
  it("fecha em uma linha com rótulo humano, nome técnico e duração", () => {
    render(<OrbToolCall tool={chamada({ durationMs: 412 })} />);

    const gatilho = screen.getByRole("button");
    expect(gatilho).toHaveAttribute("aria-expanded", "false");
    expect(gatilho).toHaveTextContent("query_spend_by_category");
    expect(gatilho).toHaveTextContent("412 ms");
    // Estado não pode ser só cor: o rótulo existe para o leitor de tela.
    expect(gatilho).toHaveTextContent("Concluída");
  });

  it("abre com parâmetros e resultado em tabela, com dinheiro em BRL", async () => {
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

    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
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
    render(<OrbToolCall tool={chamada({ summary: { itens: linhas } })} />);

    await user.click(screen.getByRole("button"));

    expect(screen.getAllByRole("row")).toHaveLength(21); // 20 linhas + cabeçalho
    expect(screen.getByText("+5 linhas não exibidas")).toBeInTheDocument();
  });

  it("marca falha em âmbar, não em vermelho, e anuncia o estado", () => {
    const { container } = render(<OrbToolCall tool={chamada({ status: "error" })} />);

    expect(screen.getByRole("button")).toHaveTextContent("Falhou");
    const cartao = container.firstElementChild;
    expect(cartao?.className).toContain("border-warning/40");
    expect(cartao?.className).not.toContain("destructive");
  });

  it("cai no JSON quando o resumo não é tabelável", async () => {
    const user = userEvent.setup();
    render(<OrbToolCall tool={chamada({ summary: { truncated: true, itens: 320 } })} />);

    await user.click(screen.getByRole("button"));

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/"truncated": true/)).toBeInTheDocument();
  });
});
