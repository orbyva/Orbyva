import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MarkdownPreview } from "@/components/MarkdownPreview";

/**
 * Regressão de segurança do preview (feature 067 sobre a decisão da 055).
 *
 * A garantia deste projeto é estrutural, não um sanitizador: **`rehype-raw` não está instalado**,
 * então HTML escrito dentro do Markdown é texto, não markup. Toda sintaxe nova (callout, fórmula,
 * realce, âncora de título, checklist) é uma oportunidade de reabrir esse buraco por acidente — um
 * plugin que gere HTML cru, um `dangerouslySetInnerHTML` alimentado por texto do usuário. Este
 * arquivo é a rede que estoura quando isso acontecer.
 */
function expectInert(container: HTMLElement) {
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.querySelector("[onerror]")).toBeNull();
  expect(container.querySelector("[onload]")).toBeNull();
}

describe("MarkdownPreview — segurança", () => {
  it("`<script>` e `<img onerror>` continuam inertes", () => {
    const { container } = render(
      <MarkdownPreview
        content={"<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>"}
      />
    );

    expectInert(container);
    expect(container.textContent).toContain("<script>");
    expect(container.textContent).toContain("<img");
  });

  it("`[x](javascript:alert(1))` continua barrado", () => {
    render(<MarkdownPreview content="[clique](javascript:alert(1))" />);

    const link = screen.getByText("clique");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("");
  });

  it("`data:text/html` em link também é barrado pelo saneamento padrão", () => {
    render(
      <MarkdownPreview content="[abrir](data:text/html;base64,PHNjcmlwdD4=)" />
    );

    expect(screen.getByText("abrir").getAttribute("href")).toBe("");
  });

  it("callout não abre caminho para HTML cru — nem no corpo nem no título", () => {
    const { container } = render(
      <MarkdownPreview
        content={
          "> [!WARNING] <img src=x onerror=alert(1)>\n> <script>alert(1)</script>"
        }
      />
    );

    expect(screen.getByRole("note")).toBeInTheDocument();
    expectInert(container);
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("tipo de callout forjado não vira atributo arbitrário", () => {
    const { container } = render(
      <MarkdownPreview content={'> [!NOTE" onmouseover="alert(1)]\n> corpo'} />
    );

    // Tipo desconhecido: continua citação comum, sem `data-callout` nenhum.
    expect(screen.queryByRole("note")).toBeNull();
    expect(container.querySelector("[data-callout]")).toBeNull();
    expectInert(container);
  });

  it("fórmula não é uma porta para markup: `\\href` fica desligado (`trust: false`)", async () => {
    const { container } = render(
      <MarkdownPreview content={"$\\href{javascript:alert(1)}{clique}$"} />
    );

    await waitFor(() => {
      expect(
        container.querySelector(".katex") ?? container.querySelector('[role="alert"]')
      ).not.toBeNull();
    });
    // Ou o KaTeX recusa a fórmula, ou ela sai sem link — o que não pode existir é o `<a href>`.
    const link = container.querySelector("a");
    expect(link?.getAttribute("href") ?? "").not.toContain("javascript:");
    expectInert(container);
  });

  it("HTML dentro de bloco realçado continua sendo texto realçado, não markup", () => {
    const { container } = render(
      <MarkdownPreview
        content={"```html\n<img src=x onerror=alert(1)>\n```"}
      />
    );

    expectInert(container);
    expect(container.querySelector("pre > code")?.textContent).toContain(
      "<img src=x onerror=alert(1)>"
    );
  });

  it("realce não introduz atributo além de `class`", () => {
    const { container } = render(
      <MarkdownPreview content={"```ts\nconst a = 1;\n```"} />
    );

    for (const span of container.querySelectorAll("pre span")) {
      expect([...span.attributes].map((a) => a.name)).toEqual(["class"]);
    }
  });

  it("âncora de título aponta só para fragmento local", () => {
    const { container } = render(
      <MarkdownPreview content={'# <img src=x onerror=alert(1)>'} />
    );

    expectInert(container);
    for (const anchor of container.querySelectorAll("h1 a")) {
      expect(anchor.getAttribute("href")?.startsWith("#")).toBe(true);
    }
  });

  it("checklist somente-leitura não vira campo editável por acidente", () => {
    render(<MarkdownPreview content={"- [ ] item"} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("`rehype-raw` continua fora do projeto", async () => {
    const pkg = await import("../../../package.json");
    const deps = {
      ...(pkg.default.dependencies ?? {}),
      ...(pkg.default.devDependencies ?? {}),
    } as Record<string, string>;

    // Se algum dia entrar, tem que entrar junto com `rehype-sanitize` — ver Decisões da 055.
    expect(deps["rehype-raw"]).toBeUndefined();
  });
});
