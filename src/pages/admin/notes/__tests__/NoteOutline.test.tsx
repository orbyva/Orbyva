import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteOutline } from "@/pages/admin/notes/NoteOutline";

/**
 * O painel de sumário da 068. O que precisa ficar provado aqui é quando ele **não** aparece —
 * é a metade da decisão que um teste de "renderiza a lista" não cobriria.
 */

function renderOutline(content: string, activeSlug?: string) {
  const onSelect = vi.fn();
  render(
    <NoteOutline content={content} activeSlug={activeSlug} onSelect={onSelect} />
  );
  return onSelect;
}

const DUAS_SECOES = "# Etapas\n\ntexto\n\n## Materiais\n\nmais texto";

describe("NoteOutline", () => {
  it("não renderiza nada com menos de dois títulos", () => {
    renderOutline("# Só um\n\ntexto solto");
    expect(screen.queryByRole("navigation", { name: "Sumário da nota" })).toBeNull();
    expect(screen.queryByText("Sumário")).toBeNull();
  });

  it("nota sem título nenhum também não mostra o painel", () => {
    renderOutline("só um parágrafo");
    expect(screen.queryByText("Sumário")).toBeNull();
  });

  it("com dois títulos, lista os dois na ordem do documento", () => {
    renderOutline(DUAS_SECOES);

    const items = screen.getAllByRole("button", { name: /Etapas|Materiais/ });
    expect(items.map((item) => item.textContent)).toEqual(["Etapas", "Materiais"]);
  });

  it("o recuo mostra a hierarquia: o nível 2 fica mais à direita que o nível 1", () => {
    renderOutline(DUAS_SECOES);

    const nivel1 = screen.getByRole("button", { name: "Etapas" });
    const nivel2 = screen.getByRole("button", { name: "Materiais" });
    expect(parseFloat(nivel2.style.paddingLeft)).toBeGreaterThan(
      parseFloat(nivel1.style.paddingLeft)
    );
  });

  it("clicar num título devolve o heading inteiro, com linha e slug", async () => {
    const user = userEvent.setup();
    const onSelect = renderOutline(DUAS_SECOES);

    await user.click(screen.getByRole("button", { name: "Materiais" }));

    expect(onSelect).toHaveBeenCalledWith({
      level: 2,
      text: "Materiais",
      slug: "materiais",
      line: 5,
    });
  });

  it("a seção atual é marcada com aria-current", () => {
    renderOutline(DUAS_SECOES, "materiais");

    expect(screen.getByRole("button", { name: "Materiais" })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(screen.getByRole("button", { name: "Etapas" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("dá para colapsar a lista sem perder o botão de reabrir", async () => {
    const user = userEvent.setup();
    renderOutline(DUAS_SECOES);

    await user.click(screen.getByRole("button", { name: /Sumário/ }));

    expect(screen.queryByRole("navigation", { name: "Sumário da nota" })).toBeNull();
    expect(screen.getByRole("button", { name: /Sumário/ })).toBeInTheDocument();
  });

  it("fica escondido abaixo de `lg` (decisão: não há largura em telefone)", () => {
    const { container } = render(
      <NoteOutline content={DUAS_SECOES} onSelect={vi.fn()} />
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("hidden");
    expect(root.className).toContain("lg:block");
  });

  it("títulos repetidos viram itens distintos (mesmo texto, slugs diferentes)", async () => {
    const user = userEvent.setup();
    const onSelect = renderOutline("# Etapas\n\n# Etapas");

    const items = screen.getAllByRole("button", { name: "Etapas" });
    expect(items).toHaveLength(2);

    await user.click(items[1]);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "etapas-1", line: 3 })
    );
  });
});
