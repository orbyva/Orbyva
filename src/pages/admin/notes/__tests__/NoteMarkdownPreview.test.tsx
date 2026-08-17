import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NoteMarkdownPreview } from "@/pages/admin/notes/NoteMarkdownPreview";
import type { Note } from "@/types/notes";

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

    expect(screen.getByRole("heading", { name: "Etapas" })).toBeInTheDocument();
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
