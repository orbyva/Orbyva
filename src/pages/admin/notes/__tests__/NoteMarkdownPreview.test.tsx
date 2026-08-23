import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { NoteMarkdownPreview } from "@/pages/admin/notes/NoteMarkdownPreview";
import { NoteEditor } from "@/pages/admin/notes/NoteEditor";
import type { Note } from "@/types/notes";

const { updateNoteMock, toastMock } = vi.hoisted(() => ({
  updateNoteMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/api/notes/notes", () => ({ updateNote: updateNoteMock }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));
// Painéis de vínculo e o editor de código são de outras features — aqui só atrapalhariam.
vi.mock("@/pages/admin/notes/NoteLinksPanel", () => ({ NoteLinksPanel: () => null }));
vi.mock("@/pages/admin/notes/BacklinksPanel", () => ({ BacklinksPanel: () => null }));
vi.mock("@/components/MarkdownCodeEditor", () => ({
  MarkdownCodeEditor: ({ value }: { value: string }) => (
    <textarea readOnly value={value} aria-label="Conteúdo" />
  ),
}));

/**
 * Wiki-link no preview (feature 056): resolvido vira link para a nota; não resolvido vira o chip
 * de criar. Substitui a "verificação manual nos dois estados" que a tarefa descrevia — a skill
 * `next` proíbe navegador.
 */

function note(id: string, title: string): Note {
  return { id, title, content: "", project_id: null, kind: "markdown", canvas_data: null };
}

function renderPreview(
  content: string,
  notes: Note[],
  onCreateNote?: (title: string) => void
) {
  return render(
    <MemoryRouter>
      <NoteMarkdownPreview
        content={content}
        notes={notes}
        onCreateNote={onCreateNote}
      />
    </MemoryRouter>
  );
}

describe("NoteMarkdownPreview — wiki-links", () => {
  it("um `[[Título]]` que existe vira link para a nota", () => {
    renderPreview("ver [[Obra da casa]] hoje", [note("n7", "Obra da casa")]);

    const link = screen.getByRole("link", { name: "Obra da casa" });
    expect(link).toHaveAttribute("href", "/notes/n7");
  });

  it("resolve ignorando caixa e espaço sobrando no título", () => {
    renderPreview("[[  obra   da casa ]]", [note("n7", "Obra da casa")]);
    expect(screen.getByRole("link", { name: /obra/i })).toHaveAttribute(
      "href",
      "/notes/n7"
    );
  });

  it("um `[[Título]]` que não existe vira chip de criar, e o clique manda o título", async () => {
    const user = userEvent.setup();
    const onCreateNote = vi.fn();
    renderPreview("falta a [[Pauta de setembro]]", [], onCreateNote);

    // Não é link: não dá para navegar para uma nota que não existe.
    expect(screen.queryByRole("link")).toBeNull();
    const chip = screen.getByRole("button", { name: "Criar nota Pauta de setembro" });

    await user.click(chip);
    expect(onCreateNote).toHaveBeenCalledWith("Pauta de setembro");
  });

  it("vários wiki-links na mesma linha resolvem cada um para o seu destino", () => {
    renderPreview(
      "[[Obra da casa]] e [[Reunião]] e [[Some]]",
      [note("n7", "Obra da casa"), note("n8", "Reunião")],
      vi.fn()
    );

    expect(screen.getByRole("link", { name: "Obra da casa" })).toHaveAttribute(
      "href",
      "/notes/n7"
    );
    expect(screen.getByRole("link", { name: "Reunião" })).toHaveAttribute(
      "href",
      "/notes/n8"
    );
    expect(screen.getByRole("button", { name: "Criar nota Some" })).toBeInTheDocument();
  });

  it("`[[…]]` dentro de código continua literal, sem virar link nem chip", () => {
    renderPreview("escreva `[[Assim]]` para linkar", [note("n1", "Assim")], vi.fn());

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("[[Assim]]").tagName).toBe("CODE");
  });

  it("o resto do Markdown continua funcionando ao lado do wiki-link", () => {
    renderPreview("## Etapas\n\n- [[Obra da casa]]\n- **negrito**", [
      note("n7", "Obra da casa"),
    ]);

    // O nome acessível do título agora inclui a âncora de seção da 067 — daí o regex.
    expect(screen.getByRole("heading", { name: /Etapas/ })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("negrito").tagName).toBe("STRONG");
  });

  it("link `javascript:` escrito pelo usuário continua barrado", () => {
    // O `urlTransform` customizado só abre exceção para o esquema dos wiki-links quebrados; o
    // saneamento padrão do react-markdown segue valendo para o resto (decisão de segurança da 055).
    renderPreview("[clique](javascript:alert(1))", []);

    const link = screen.getByText("clique");
    expect(link.tagName).toBe("A");
    // O href foi zerado pelo saneamento — clicar não executa nada.
    expect(link.getAttribute("href")).toBe("");
  });

  it("HTML cru continua sem ser interpretado", () => {
    renderPreview("<b>não</b> vira negrito", []);
    expect(screen.queryByText("não")).toBeNull();
    expect(screen.getByText(/<b>não<\/b> vira negrito/)).toBeInTheDocument();
  });

  it("sem `onCreateNote`, o chip aparece desabilitado em vez de sumir", () => {
    renderPreview("[[Sem nota]]", []);
    expect(screen.getByRole("button", { name: "Criar nota Sem nota" })).toBeDisabled();
  });
});

/**
 * Checklist interativa (feature 067): clicar num `- [ ]` do preview reescreve o Markdown da nota e
 * grava. O clique é afirmado aqui, com o `NoteEditor` de verdade — a skill `next` proíbe conferir
 * no navegador, e o que importa provar é o efeito colateral (o que foi salvo), não o pixel.
 */
describe("NoteMarkdownPreview — checklist interativa", () => {
  beforeEach(() => {
    updateNoteMock.mockReset();
    updateNoteMock.mockResolvedValue(undefined);
    toastMock.mockReset();
  });

  function noteWith(content: string): Note {
    return { id: "n1", title: "Compras", content, project_id: null, kind: "markdown", canvas_data: null };
  }

  async function renderEditorPreview(content: string) {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NoteEditor note={noteWith(content)} projects={[]} debounceMs={0} />
      </MemoryRouter>
    );
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    return user;
  }

  it("clicar no checkbox salva o conteúdo com o item marcado", async () => {
    const user = await renderEditorPreview("- [ ] comprar\n- [ ] pagar\n");

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes[1]).toBeEnabled();

    await user.click(boxes[1]);

    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "n1", content: "- [ ] comprar\n- [x] pagar\n" })
      );
    });
  });

  it("o índice do clique casa com a linha certa mesmo com bloco de código no meio", async () => {
    const content = "- [ ] real\n\n```md\n- [ ] exemplo\n```\n\n- [ ] outro real\n";
    const user = await renderEditorPreview(content);

    const boxes = screen.getAllByRole("checkbox");
    // O `- [ ]` de dentro do bloco de código não vira checkbox — são dois, não três.
    expect(boxes).toHaveLength(2);

    await user.click(boxes[1]);

    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "- [ ] real\n\n```md\n- [ ] exemplo\n```\n\n- [x] outro real\n",
        })
      );
    });
  });

  it("desmarcar também grava", async () => {
    const user = await renderEditorPreview("- [x] pago\n");

    await user.click(screen.getByRole("checkbox"));

    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ content: "- [ ] pago\n" })
      );
    });
  });

  it("erro ao salvar mostra toast e desmarca o item de volta", async () => {
    updateNoteMock.mockRejectedValue(new Error("sem rede"));
    const user = await renderEditorPreview("- [ ] comprar\n");

    await user.click(screen.getByRole("checkbox"));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      );
    });
    // A mentira silenciosa que isto evita: checkbox marcado na tela, nada gravado no banco.
    await waitFor(() => {
      expect(screen.getByRole("checkbox")).not.toBeChecked();
    });
  });

  it("sem handler (a descrição de tarefa) o checkbox continua desabilitado", () => {
    render(<MarkdownPreview content={"- [ ] tarefa\n- [x] feita"} />);

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toBeDisabled();
    expect(boxes[1]).toBeDisabled();
    expect(boxes[1]).toBeChecked();
  });

  it("o preview da nota sem `onToggleTaskItem` também segue somente-leitura", () => {
    renderPreview("- [ ] item", []);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
