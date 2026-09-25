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

  it("tabela rola dentro do próprio embrulho, não na página", () => {
    const root = renderDocumento("| a | b |\n| - | - |\n| 1 | 2 |");

    const table = root.querySelector("table");
    expect(table).not.toBeNull();

    const wrapper = table?.parentElement;
    expect(wrapper).toHaveClass("markdown-table-scroll");
    // O embrulho fica dentro do contêiner, não em volta dele.
    expect(wrapper?.closest(`.${MARKDOWN_PREVIEW_CLASS}`)).toBe(root);
    // Conteúdo intacto: o embrulho é estrutura, não filtro.
    expect(table).toHaveTextContent("1");
    expect(table).toHaveTextContent("2");
  });

  it("kbd escrito como texto não vira elemento (HTML cru continua desligado)", () => {
    const root = renderDocumento("aperte <kbd>Ctrl</kbd>");

    expect(root.querySelector("kbd")).toBeNull();
    expect(root.textContent).toContain("<kbd>");
  });
});

/**
 * Footnote já era *parseada* pelo `remark-gfm` desde a 055 — o que faltava era estilo e rótulo em
 * português. O que dá para afirmar sem CSS é que as âncoras que a folha usa como seletor
 * (`data-footnote-ref`, `[data-footnotes]`, `.data-footnote-backref`) estão mesmo no DOM, e que a
 * ida e a volta apontam uma para a outra.
 */
describe("MarkdownPreview — footnotes", () => {
  const NOTA = "texto[^1] e mais\n\n[^1]: a nota de rodape";

  it("o marcador vira <sup> com link para a nota", () => {
    const root = renderDocumento(NOTA);

    const ref = root.querySelector<HTMLAnchorElement>("sup a[data-footnote-ref]");
    expect(ref).not.toBeNull();
    expect(ref).toHaveTextContent("1");
    expect(ref?.getAttribute("href")).toBe("#user-content-fn-1");
  });

  it("a seção de rodapé sai no fim, com o texto da nota", () => {
    const root = renderDocumento(NOTA);

    const section = root.querySelector("[data-footnotes]");
    expect(section).not.toBeNull();
    expect(section?.tagName).toBe("SECTION");
    expect(section).toHaveTextContent("a nota de rodape");
    // Rodapé é rodapé: vem depois do parágrafo que a cita.
    expect(root.lastElementChild).toBe(section);
  });

  it("o link de volta aponta para o marcador que trouxe até aqui", () => {
    const root = renderDocumento(NOTA);

    const backref = root.querySelector<HTMLAnchorElement>(
      "a.data-footnote-backref"
    );
    expect(backref).not.toBeNull();
    expect(backref?.getAttribute("href")).toBe("#user-content-fnref-1");
    expect(backref).toHaveTextContent("↩");
    // O alvo do link de volta é o id do marcador — ida e volta fecham o ciclo.
    const ref = root.querySelector("sup a[data-footnote-ref]");
    expect(ref?.id).toBe("user-content-fnref-1");
  });

  it("os rótulos de acessibilidade da footnote saem em português", () => {
    const root = renderDocumento(NOTA);

    expect(root.querySelector("#footnote-label")).toHaveTextContent(
      "Notas de rodapé"
    );
    expect(
      root.querySelector("a.data-footnote-backref")?.getAttribute("aria-label")
    ).toBe("Voltar à referência 1");
  });

  it("duas footnotes numeram e ligam cada uma à sua", () => {
    const root = renderDocumento(
      "a[^um] b[^dois]\n\n[^um]: primeira\n\n[^dois]: segunda"
    );

    const refs = root.querySelectorAll("sup a[data-footnote-ref]");
    expect(refs).toHaveLength(2);
    expect(refs[0]).toHaveTextContent("1");
    expect(refs[1]).toHaveTextContent("2");

    const items = root.querySelectorAll("[data-footnotes] li");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("primeira");
    expect(items[1]).toHaveTextContent("segunda");
    expect(refs[1].getAttribute("href")).toBe(`#${items[1].id}`);
  });
});

/**
 * Callout (`> [!NOTE]`) é CSS puro pendurado num atributo que o `remarkCallout` escreve. Sem folha
 * de estilo em jsdom, o que dá para afirmar — e é o que importa — é que o atributo chega ao
 * `<blockquote>` certo, com o texto do usuário inteiro. Se o plugin saísse do array central de
 * plugins, todo callout do app viraria citação cinzenta sem nenhum erro de build.
 */
describe("MarkdownPreview — callouts", () => {
  it("o blockquote de aviso chega marcado e sem o marcador no texto", () => {
    const root = renderDocumento("> [!WARNING]\n> cuidado com o prazo");

    const callout = root.querySelector('[data-callout="warning"]');
    expect(callout).not.toBeNull();
    expect(callout?.tagName).toBe("BLOCKQUOTE");
    expect(callout).toHaveTextContent("cuidado com o prazo");
    // O marcador é sintaxe, não conteúdo: some da tela.
    expect(root.textContent).not.toContain("[!WARNING]");
  });

  it.each([
    ["NOTE", "note"],
    ["TIP", "tip"],
    ["IMPORTANT", "important"],
    ["WARNING", "warning"],
    ["CAUTION", "caution"],
  ])("> [!%s] vira data-callout=%s", (marcador, tipo) => {
    const root = renderDocumento(`> [!${marcador}]\n> corpo`);

    expect(root.querySelector(`[data-callout="${tipo}"]`)).toHaveTextContent(
      "corpo"
    );
  });

  it("citação comum continua citação (sem atributo de callout)", () => {
    const root = renderDocumento("> só uma citação");

    expect(root.querySelector("[data-callout]")).toBeNull();
    expect(root.querySelector("blockquote")).toHaveTextContent("só uma citação");
  });

  it("tipo desconhecido não some da tela", () => {
    const root = renderDocumento("> [!FOO]\n> texto");

    expect(root.querySelector("[data-callout]")).toBeNull();
    expect(root.querySelector("blockquote")).toHaveTextContent("[!FOO]");
    expect(root.querySelector("blockquote")).toHaveTextContent("texto");
  });

  it("o conteúdo do callout continua sendo Markdown (lista, link, código)", () => {
    const root = renderDocumento(
      "> [!TIP]\n> - passo `um`\n> - [dois](https://exemplo.com)"
    );

    const callout = root.querySelector('[data-callout="tip"]');
    expect(callout?.querySelectorAll("li")).toHaveLength(2);
    expect(callout?.querySelector("code")).toHaveTextContent("um");
    expect(callout?.querySelector("a")).toHaveAttribute(
      "href",
      "https://exemplo.com"
    );
  });

  it("HTML cru dentro de callout continua não interpretado", () => {
    const root = renderDocumento("> [!CAUTION]\n> <img src=x onerror=alert(1)>");

    const callout = root.querySelector('[data-callout="caution"]');
    expect(callout).not.toBeNull();
    expect(root.querySelector("img")).toBeNull();
    expect(callout?.textContent).toContain("<img");
  });
});
