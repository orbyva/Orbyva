import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteOutlinePanel } from "@/pages/admin/notes/NoteOutlinePanel";

/**
 * O sumário da nota (feature 070). O painel só lista e avisa o que foi escolhido — quem rola é o
 * editor —, então é isso que o teste afirma: o que aparece, em que hierarquia, e o que ele
 * devolve no clique.
 */

const NOTA = [
  "# Projeto",
  "",
  "texto",
  "",
  "## Escopo",
  "",
  "### Fora do escopo",
  "",
  "## Prazos",
  "",
  "```sh",
  "# não é título, é comentário de shell",
  "```",
].join("\n");

function itemNames(): string[] {
  return screen
    .getAllByRole("button")
    .map((b) => b.textContent ?? "")
    .filter((text) => text.trim() !== "");
}

describe("NoteOutlinePanel", () => {
  it("lista os títulos da nota, na ordem, ignorando `#` dentro de código", () => {
    render(<NoteOutlinePanel content={NOTA} onSelect={() => {}} />);

    expect(screen.getByRole("heading", { name: "Sumário" })).toBeInTheDocument();
    expect(itemNames()).toEqual(["Projeto", "Escopo", "Fora do escopo", "Prazos"]);
    expect(screen.queryByText(/comentário de shell/)).toBeNull();
  });

  it("indenta por nível — a hierarquia é o que faz o sumário ser sumário", () => {
    render(<NoteOutlinePanel content={NOTA} onSelect={() => {}} />);

    const classOf = (name: string) =>
      screen.getByRole("button", { name }).className;
    expect(classOf("Projeto")).toContain("pl-0");
    expect(classOf("Escopo")).toContain("pl-3");
    expect(classOf("Fora do escopo")).toContain("pl-6");
  });

  it("clicar devolve o título escolhido, com a linha e a âncora dele", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NoteOutlinePanel content={NOTA} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Fora do escopo" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Fora do escopo",
        level: 3,
        // 7ª linha do documento (1-based) — é o que o editor usa para rolar.
        line: 7,
        slug: "fora-do-escopo",
      })
    );
  });

  it("nota sem título mostra o estado vazio, não uma lista vazia", () => {
    render(<NoteOutlinePanel content={"só texto\n\nsem título nenhum"} onSelect={() => {}} />);

    expect(screen.getByText("Sem títulos ainda")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("o painel recolhe e volta", async () => {
    const user = userEvent.setup();
    render(<NoteOutlinePanel content={NOTA} onSelect={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Recolher sumário" }));
    expect(screen.queryByRole("button", { name: "Escopo" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Expandir sumário" }));
    expect(screen.getByRole("button", { name: "Escopo" })).toBeInTheDocument();
  });

  it("título repetido recebe âncora própria — dois itens, dois alvos", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NoteOutlinePanel content={"## Notas\n\n## Notas"} onSelect={onSelect} />);

    const items = screen.getAllByRole("button", { name: "Notas" });
    expect(items).toHaveLength(2);

    await user.click(items[1]);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "notas-2", line: 3 })
    );
  });
});
