import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  MARKDOWN_PREVIEW_CLASS,
  MarkdownPreview,
} from "@/components/MarkdownPreview";

/**
 * A tipografia da 069 mora em CSS (`.markdown-body`, em `src/index.css`), e jsdom não carrega
 * folha de estilo nenhuma — então o que dá para afirmar aqui não é "o h3 está com 13px", e sim o
 * contrato entre o Markdown e a folha: **cada tag que a folha estiliza chega mesmo ao DOM, dentro
 * do contêiner que carrega a classe**. Se um `###` parasse de virar `<h3>`, ou se o contêiner
 * perdesse a classe, o estilo sumiria da tela sem nenhum erro de build — é exatamente esse buraco
 * que este arquivo tapa.
 */
const DOCUMENTO = [
  "# Titulo um",
  "",
  "## Titulo dois",
  "",
  "### Titulo tres",
  "",
  "#### Titulo quatro",
  "",
  "##### Titulo cinco",
  "",
  "###### Titulo seis",
  "",
  "> uma citacao",
  "",
  "---",
  "",
  "![gato](/gato.png)",
  "",
  "[um link](https://exemplo.com)",
  "",
  "- pai",
  "  - filho",
  "",
  "```",
  "codigo sem linguagem",
  "```",
].join("\n");

function renderDocumento(content: string, className?: string) {
  const { container } = render(
    <MarkdownPreview content={content} className={className} />
  );
  const root = container.querySelector<HTMLElement>(
    `.${MARKDOWN_PREVIEW_CLASS}`
  );
  if (!root) throw new Error("contêiner .markdown-body não encontrado");
  return root;
}

describe("MarkdownPreview — tipografia", () => {
  it("o contêiner carrega a classe da folha, e o className do consumidor vem depois", () => {
    const root = renderDocumento("oi", "text-base");

    expect(MARKDOWN_PREVIEW_CLASS).toBe("markdown-body");
    expect(root).toHaveClass("markdown-body");
    // A utility do consumidor precisa continuar presente: é ela que vence a folha na cascata.
    expect(root).toHaveClass("text-base");
  });

  it.each([
    ["h1", "Titulo um"],
    ["h2", "Titulo dois"],
    ["h3", "Titulo tres"],
    ["h4", "Titulo quatro"],
    ["h5", "Titulo cinco"],
    ["h6", "Titulo seis"],
  ])("%s chega ao DOM dentro do contêiner estilizado", (tag, texto) => {
    const root = renderDocumento(DOCUMENTO);

    const heading = root.querySelector(tag);
    expect(heading).not.toBeNull();
    expect(heading).toHaveTextContent(texto);
    expect(heading?.closest(`.${MARKDOWN_PREVIEW_CLASS}`)).toBe(root);
  });

  it("citação, regra e imagem chegam com as tags que a folha estiliza", () => {
    const root = renderDocumento(DOCUMENTO);

    const quote = root.querySelector("blockquote");
    expect(quote).toHaveTextContent("uma citacao");

    expect(root.querySelector("hr")).not.toBeNull();

    const img = root.querySelector("img");
    expect(img).toHaveAttribute("src", "/gato.png");
    expect(img).toHaveAttribute("alt", "gato");
  });

  it("link vira <a> com href preservado", () => {
    const root = renderDocumento(DOCUMENTO);

    const link = root.querySelector("a");
    expect(link).toHaveAttribute("href", "https://exemplo.com");
    expect(link).toHaveTextContent("um link");
  });

  it("lista aninhada continua aninhada (a folha estiliza por profundidade)", () => {
    const root = renderDocumento(DOCUMENTO);

    const nested = root.querySelector("ul ul");
    expect(nested).not.toBeNull();
    expect(nested).toHaveTextContent("filho");
  });

  it("fence sem linguagem continua saindo em <pre><code>", () => {
    const root = renderDocumento(DOCUMENTO);

    const code = root.querySelector("pre > code");
    expect(code).toHaveTextContent("codigo sem linguagem");
  });

  it("checkbox de task-list chega desabilitado, como leitura (a edição é da 070)", () => {
    const root = renderDocumento("- [x] feito\n- [ ] pendente");

    const boxes = root.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]'
    );
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
    expect(boxes[0].disabled).toBe(true);
  });

  it("kbd escrito como texto não vira elemento (HTML cru continua desligado)", () => {
    const root = renderDocumento("aperte <kbd>Ctrl</kbd>");

    expect(root.querySelector("kbd")).toBeNull();
    expect(root.textContent).toContain("<kbd>");
  });
});
