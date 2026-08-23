import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HEADING_ANCHOR_LABEL, MarkdownPreview } from "@/components/MarkdownPreview";

/**
 * # A verificação do pedido literal da 067: "nível sofisticado de escrita"
 *
 * Cada recurso desta feature já tem o seu próprio arquivo de teste. O que **este** arquivo prova é
 * outra coisa: que eles funcionam **ao mesmo tempo, na mesma nota**. É o modo de falha mais
 * provável de um preview montado por camadas de plugin — o realce comendo o diagrama, a fórmula
 * quebrando dentro do callout, a tabela larga estourando o layout do resto —, e é exatamente o que
 * um teste por recurso não pega.
 *
 * A skill `next` proíbe navegador, então a nota "de verdade" é esta fixture, e "não quebrou" é
 * medido por asserção, não por olhar a tela — inclusive a exigência de nenhum erro no console.
 *
 * O mermaid é dublado pelo mesmo motivo do `MermaidBlock.test.tsx`: ele mede texto com APIs que o
 * jsdom não implementa. O que importa aqui é que o fence chegou nele **inteiro e cru**, sem o
 * realce ter picado o código em `<span>` no caminho.
 */
const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

/** Uma nota que usa tudo o que a 067 acrescentou, de uma vez só. */
const NOTA = `# Reforma da casa

## Orçamento

> [!WARNING] Prazo do cartório
> A escritura vence dia 30, e a multa é diária.

O custo por metro é $c = \\frac{v}{a}$, e o total sai de:

$$
T = \\sum_{i=1}^{n} c_i \\cdot a_i
$$

| Item | Fornecedor | Prazo | Valor | Observação | Status |
| --- | --- | --- | --- | --- | --- |
| Piso | Cerâmica Sul | 15 dias | 4.200 | entrega parcelada | firme |
| Tinta | Cores & Cia | 3 dias | 890 | cor sob encomenda | a confirmar |

### Pendências

- [ ] fechar o piso
- [x] pagar a entrada
- [ ] agendar a vistoria

O cálculo saiu da planilha antiga[^1].

\`\`\`ts
const total = itens.reduce((acc, item) => acc + item.valor, 0);
\`\`\`

\`\`\`mermaid
graph TD; Orcamento-->Compra; Compra-->Obra;
\`\`\`

## Orçamento

(sim, dois títulos iguais — o segundo é o revisado)

[^1]: A planilha de 2025, arquivada no drive.
`;

beforeEach(() => {
  mermaidMock.initialize.mockReset();
  mermaidMock.parse.mockReset().mockResolvedValue(true);
  mermaidMock.render
    .mockReset()
    .mockResolvedValue({ svg: "<svg><text>Orcamento</text></svg>" });
});

describe("nota usando todas as sintaxes da 067 ao mesmo tempo", () => {
  it("renderiza inteira, sem um recurso quebrar o outro e sem erro no console", async () => {
    const errors: unknown[][] = [];
    const warnings: unknown[][] = [];
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args) => void errors.push(args));
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation((...args) => void warnings.push(args));

    const onToggleTaskItem = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <MarkdownPreview content={NOTA} onToggleTaskItem={onToggleTaskItem} />
    );

    // ---- Título com id e âncora, inclusive o par de títulos repetidos
    await waitFor(() => {
      expect(container.querySelector(".katex")).not.toBeNull();
    });
    // Dois `## Orçamento` iguais viram ids distintos; o terceiro h2 é o rótulo (invisível) que o
    // GFM cria para a seção de notas de rodapé.
    expect([...container.querySelectorAll("h2")].map((h) => h.id)).toEqual([
      "orçamento",
      "orçamento-1",
      "footnote-label",
    ]);
    expect(container.querySelector("h3")).toHaveAttribute("id", "pendências");
    const headings = container.querySelectorAll("h1[id], h2[id], h3[id]");
    expect(screen.getAllByRole("link", { name: HEADING_ANCHOR_LABEL })).toHaveLength(
      headings.length
    );

    // ---- Callout
    const callout = screen.getByRole("note", { name: "Prazo do cartório" });
    expect(callout).toHaveAttribute("data-callout", "warning");
    expect(callout).toHaveTextContent("A escritura vence dia 30");

    // ---- Fórmula inline e em bloco, as duas pelo KaTeX
    expect(screen.getByTestId("math-inline")).toBeInTheDocument();
    expect(screen.getByTestId("math-display")).toBeInTheDocument();
    expect(container.querySelector(".katex-display")).not.toBeNull();
    // Nenhuma fórmula caiu no estado de erro.
    expect(screen.queryByRole("alert")).toBeNull();

    // ---- Bloco ```ts realçado
    const tsBlock = container.querySelector("code.language-ts");
    expect(tsBlock).toHaveClass("hljs");
    expect(tsBlock?.querySelector(".hljs-keyword")).not.toBeNull();

    // ---- Diagrama mermaid: o fence chegou cru, sem passar pelo realce
    await waitFor(() => expect(mermaidMock.render).toHaveBeenCalled());
    expect(mermaidMock.render.mock.calls[0][1]).toBe(
      "graph TD; Orcamento-->Compra; Compra-->Obra;"
    );
    expect(await screen.findByTestId("mermaid-diagram")).toBeInTheDocument();

    // ---- Tabela larga, dentro do wrapper rolável
    const table = screen.getByRole("table");
    expect(table.parentElement).toHaveClass("overflow-x-auto");
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);

    // ---- Nota de rodapé
    expect(container.querySelector("[data-footnote-ref]")).not.toBeNull();
    expect(container.querySelector(".footnotes")).toHaveTextContent(
      "A planilha de 2025"
    );

    // ---- Checklist interativa
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([
      false,
      true,
      false,
    ]);
    await user.click(boxes[2]);
    expect(onToggleTaskItem).toHaveBeenCalledWith(2);

    // ---- HTML cru continua fora, com todas as sintaxes ligadas
    expect(container.querySelector("script")).toBeNull();

    // ---- Nada gritou no console durante tudo isso
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
