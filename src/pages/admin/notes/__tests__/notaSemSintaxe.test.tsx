import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NoteEditor } from "@/pages/admin/notes/NoteEditor";
import { extractHeadings } from "@/domain/notes/outline";
import type { Note } from "@/types/notes";

/**
 * # Verificação do pedido literal da 068, sem navegador
 *
 * O prompt-mãe pede "um nível sofisticado de escrita". A 067 provou o lado do **render** (uma nota
 * com todas as sintaxes renderizando junto). Esta é a outra metade: **escrever a nota inteira sem
 * digitar sintaxe nenhuma** — nem um `#`, nem um `>`, nem uma crase. Tudo pela barra, pelo menu `/`
 * e pelos atalhos.
 *
 * A afirmação final é dupla: o Markdown que chega no banco é o que um autor experiente escreveria à
 * mão, e o que o editor mostra em volta dele (sumário, contagem, preview) concorda com esse texto.
 */

const { updateNoteMock, toastMock } = vi.hoisted(() => ({
  updateNoteMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/api/notes/notes", () => ({ updateNote: updateNoteMock }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));
vi.mock("@/pages/admin/notes/NoteLinksPanel", () => ({ NoteLinksPanel: () => null }));
vi.mock("@/pages/admin/notes/BacklinksPanel", () => ({ BacklinksPanel: () => null }));

const note: Note = {
  id: "n1",
  title: "Reforma",
  content: "",
  project_id: null,
  folder_id: null,
  kind: "markdown",
  canvas_data: null,
};

function savedContent(): string {
  const calls = updateNoteMock.mock.calls;
  return (calls[calls.length - 1]?.[0] as { content: string })?.content ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  updateNoteMock.mockResolvedValue(undefined);
});

describe("escrever uma nota inteira sem digitar sintaxe (068)", () => {
  it("barra + menu `/` + atalhos produzem o Markdown, e o editor concorda com ele", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NoteEditor note={note} projects={[]} notes={[]} debounceMs={10} />
      </MemoryRouter>
    );

    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    await user.click(field);

    /** Escolhe um item do menu de inserção pelo rótulo — o mesmo caminho do usuário. */
    async function insertFromMenu(label: RegExp, query: string) {
      await user.keyboard("{Control>}{End}{/Control}");
      await user.keyboard(query);
      await waitFor(() =>
        expect(screen.getByRole("option", { name: label })).toBeInTheDocument()
      );
      await user.click(screen.getByRole("option", { name: label }));
    }

    /** Linha em branco no fim, para o próximo `/` ter onde disparar. */
    async function newBlock() {
      await user.keyboard("{Control>}{End}{/Control}");
      await user.keyboard("{Enter}{Enter}");
    }

    // 1. Título pela barra: o botão "Inserir" abre o mesmo menu do `/`.
    await user.click(screen.getByRole("button", { name: /Inserir/ }));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Título 1/ })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("option", { name: /Título 1/ }));
    await user.keyboard("Reforma da casa");

    // 2. Um parágrafo com negrito pela barra (seleção + botão).
    await newBlock();
    await user.keyboard("O prazo é curto");
    await user.keyboard("{Shift>}{Home}{/Shift}");
    await user.click(screen.getByRole("button", { name: "Negrito" }));

    // 3. Callout pelo menu `/`.
    await newBlock();
    await insertFromMenu(/Atenção/, "/atencao");
    await user.keyboard("A escritura vence dia 30");

    // 4. Fórmula em bloco pelo menu `/`.
    await newBlock();
    await insertFromMenu(/Fórmula/, "/formula");
    await user.keyboard("a^2 + b^2 = c^2");

    // 5. Bloco de código com linguagem escolhida no menu.
    await newBlock();
    await insertFromMenu(/Código TypeScript/, "/typescript");
    await user.keyboard("const orcamento = 1000;");

    // 6. Segundo título, agora pelo atalho de teclado.
    await newBlock();
    await user.keyboard("{Control>}{Shift>}2{/Shift}{/Control}");
    await user.keyboard("Materiais");

    // 7. Checklist pela barra.
    await newBlock();
    await user.click(screen.getByRole("button", { name: "Checklist" }));
    await user.keyboard("comprar cimento");

    const content = await waitFor(() => {
      const saved = savedContent();
      expect(saved).toContain("comprar cimento");
      return saved;
    });

    // --- o Markdown produzido é o que um autor escreveria à mão ------------------------------
    expect(content).toContain("# Reforma da casa");
    expect(content).toContain("**O prazo é curto**");
    expect(content).toContain("> [!WARNING]");
    expect(content).toContain("$$");
    expect(content).toContain("a^2 + b^2 = c^2");
    expect(content).toContain("```ts");
    expect(content).toContain("const orcamento = 1000;");
    expect(content).toContain("## Materiais");
    expect(content).toContain("- [ ] comprar cimento");
    // Nenhuma barra órfã sobrou das consultas digitadas no menu.
    expect(content).not.toMatch(/^\/\w/m);

    // --- o sumário reflete os títulos ---------------------------------------------------------
    expect(extractHeadings(content).map((h) => h.text)).toEqual([
      "Reforma da casa",
      "Materiais",
    ]);
    const outline = screen.getByRole("navigation", { name: "Sumário da nota" });
    expect(within(outline).getByRole("button", { name: "Reforma da casa" })).toBeInTheDocument();
    expect(within(outline).getByRole("button", { name: "Materiais" })).toBeInTheDocument();

    // --- a contagem é coerente: conta a prosa, não o código nem a marcação --------------------
    // "Reforma da casa" (3) + "O prazo é curto" (4) + "A escritura vence dia 30" (5) +
    // "$$ a^2 + b^2 = c^2 $$" (fórmula, contada como texto) + "Materiais" (1) +
    // "comprar cimento" (2) — e **zero** palavras do bloco ```ts.
    const footer = screen.getByText(/palavras/);
    const palavras = Number(/(\d+) palavras/.exec(footer.textContent ?? "")?.[1]);
    expect(palavras).toBeGreaterThanOrEqual(15);
    expect(palavras).toBeLessThan(25);
    expect(footer.textContent).toMatch(/min de leitura/);

    // --- o preview renderiza tudo, e a checklist é clicável (067) -----------------------------
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));

    const preview = within(screen.getAllByRole("tabpanel")[0]);
    expect(preview.getByRole("heading", { name: /Reforma da casa/ })).toBeInTheDocument();
    expect(preview.getByRole("heading", { name: /Materiais/ })).toBeInTheDocument();
    // Callout da 067 na tela, com o rótulo em português.
    expect(preview.getByRole("note")).toHaveTextContent("Atenção");
    expect(preview.getByText("O prazo é curto").tagName).toBe("STRONG");

    const checkbox = preview.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    await waitFor(() => expect(savedContent()).toContain("- [x] comprar cimento"));
  }, 15_000);
});
