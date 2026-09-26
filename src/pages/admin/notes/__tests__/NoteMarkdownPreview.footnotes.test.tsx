import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NoteMarkdownPreview } from "@/pages/admin/notes/NoteMarkdownPreview";

/**
 * Footnote (`[^1]`) dentro de uma nota.
 *
 * Duas coisas se cruzam aqui, e é por isso que o teste vive no arquivo da **nota** e não no do
 * `MarkdownPreview` cru: o `remark-gfm` emite o marcador como um `<a href="#…">`, e a nota
 * **sobrescreve o componente `a`** para tratar wiki-link. O override repassava só `href` e
 * `children` — então o marcador perdia `data-footnote-ref`, o `↩` perdia a classe
 * `data-footnote-backref`, e os dois caíam no ramo de link externo, **abrindo outra aba para rolar
 * a mesma página**. O ramo de `href` começando com `#` conserta isso.
 *
 * Os rótulos em português vêm de `remarkRehypeOptions` no `MarkdownPreview`: sem eles o
 * `mdast-util-gfm-footnote` escreve "Footnotes" e "Back to reference 1" — invisíveis na tela, mas é
 * o que o leitor de tela anuncia, num app inteiro em pt-BR.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

const NOTA = "texto[^1] e mais\n\n[^1]: a nota de rodape";

function renderPreview(content: string) {
  return render(
    <MemoryRouter>
      <NoteMarkdownPreview content={content} notes={[]} />
    </MemoryRouter>
  );
}

describe("NoteMarkdownPreview — footnotes", () => {
  it("o marcador aponta para a nota de rodapé e **não** abre em outra aba", () => {
    renderPreview(NOTA);

    const ref = document.querySelector<HTMLAnchorElement>("sup a[data-footnote-ref]");
    expect(ref).not.toBeNull();
    expect(ref?.getAttribute("href")).toBe("#user-content-fn-1");
    // O que a correção garante: âncora interna é navegação na própria página.
    expect(ref?.getAttribute("target")).toBeNull();
  });

  it("o link de volta mantém a classe do backref e fecha o ciclo com o marcador", () => {
    renderPreview(NOTA);

    const backref = document.querySelector<HTMLAnchorElement>("a.data-footnote-backref");
    expect(backref).not.toBeNull();
    expect(backref?.getAttribute("href")).toBe("#user-content-fnref-1");
    expect(backref?.getAttribute("target")).toBeNull();
    // O alvo do link de volta é o id do marcador — ida e volta fecham o ciclo.
    expect(document.querySelector("sup a[data-footnote-ref]")?.id).toBe(
      "user-content-fnref-1"
    );
  });

  it("os rótulos de acessibilidade da footnote saem em português", () => {
    renderPreview(NOTA);

    expect(document.querySelector("#footnote-label")).toHaveTextContent(
      "Notas de rodapé"
    );
    expect(
      document.querySelector("a.data-footnote-backref")?.getAttribute("aria-label")
    ).toBe("Voltar à referência 1");
  });

  it("duas footnotes numeram e ligam cada uma à sua", () => {
    renderPreview("a[^um] b[^dois]\n\n[^um]: primeira\n\n[^dois]: segunda");

    const refs = document.querySelectorAll("sup a[data-footnote-ref]");
    expect(refs).toHaveLength(2);

    const items = document.querySelectorAll("[data-footnotes] li");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("primeira");
    expect(refs[1].getAttribute("href")).toBe(`#${items[1].id}`);
  });

  it("link externo de verdade continua abrindo em outra aba", () => {
    renderPreview("ver [o site](https://exemplo.com) agora");

    const link = screen.getByRole("link", { name: "o site" });
    // Controle negativo: a correção não pode ter desarmado o `target="_blank"` do caso externo.
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });
});
