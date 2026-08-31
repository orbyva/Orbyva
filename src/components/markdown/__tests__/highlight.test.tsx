import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { blockRenderers } from "@/components/markdown/blockRegistry";
import { NO_HIGHLIGHT_CLASS } from "@/components/markdown/rehypeSkipRegisteredBlocks";
import { CODE_BLOCK_LANGUAGES } from "@/domain/notes/blockLanguage";

/**
 * Realce de sintaxe (`rehype-highlight`) e a precedência do registry de blocos da 057 sobre ele.
 * O que importa afirmar não é "tem cor" — é que o `<code>` ganhou `<span class="hljs-…">` para as
 * linguagens registradas e **não ganhou** para as que têm renderer próprio.
 */
function DemoBlock({ code }: { code: string }) {
  return <div data-testid="demo-block">demo:{code}</div>;
}

afterEach(() => {
  delete blockRenderers.demo;
});

function codeOf(container: HTMLElement): HTMLElement {
  const code = container.querySelector("pre > code");
  if (!code) throw new Error("nenhum bloco de código no HTML");
  return code as HTMLElement;
}

describe("realce de sintaxe no MarkdownPreview", () => {
  it("um bloco ```ts sai com os spans hljs esperados", () => {
    const { container } = render(
      <MarkdownPreview content={"```ts\nconst a: number = 1;\n```"} />
    );

    const code = codeOf(container);
    expect(code).toHaveClass("hljs");
    const classes = [...code.querySelectorAll("span")].map((s) => s.className);
    expect(classes).toContain("hljs-keyword");
    expect(classes).toContain("hljs-number");
    // O texto continua sendo o texto: realce não pode reescrever o código do usuário.
    expect(code.textContent).toBe("const a: number = 1;\n");
  });

  /**
   * A classe `hljs` não prova nada — o `rehype-highlight` a coloca **antes** de tentar realçar, e
   * ela fica lá mesmo quando a linguagem não está registrada. A prova é o token: `<span
   * class="hljs-…">` só existe se a gramática daquela linguagem entrou no bundle.
   */
  it.each([
    ["tsx", "const x: string = 'a';", "typescript"],
    ["js", "function f() { return 1; }", "javascript"],
    ["json", '{"a": 1}', "json"],
    ["sql", "SELECT 1 FROM t;", "sql"],
    ["bash", 'echo "oi"', "bash"],
    ["python", "def f():\n    return 1", "python"],
    ["css", "a { color: red; }", "css"],
    ["html", '<a href="x">t</a>', "xml"],
    ["md", "# Título", "markdown"],
    ["diff", "+ adicionado\n- removido", "diff"],
  ])("a linguagem `%s` está registrada (via %s)", (alias, snippet) => {
    const { container } = render(
      <MarkdownPreview content={"```" + alias + "\n" + snippet + "\n```"} />
    );

    const code = codeOf(container);
    expect(code).toHaveClass("hljs");
    const tokens = [...code.querySelectorAll("span")].filter((span) =>
      span.className.startsWith("hljs-")
    );
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("bloco sem linguagem não é realçado (nada de adivinhação)", () => {
    const { container } = render(<MarkdownPreview content={"```\nabc\n```"} />);

    const code = codeOf(container);
    expect(code).not.toHaveClass("hljs");
    expect(code.querySelectorAll("span")).toHaveLength(0);
  });

  it("linguagem fora da lista registrada não quebra nada — sai como texto", () => {
    const { container } = render(
      <MarkdownPreview content={"```erlang\nfoo() -> ok.\n```"} />
    );

    const code = codeOf(container);
    expect(code.textContent).toBe("foo() -> ok.\n");
    expect(code.querySelectorAll("span")).toHaveLength(0);
  });

  it("```mermaid não é realçado: vai inteiro para o renderer da 057", () => {
    render(<MarkdownPreview content={"```mermaid\ngraph TD;\nA-->B;\n```"} />);

    // Só o `MermaidBlock` (que carrega a lib por import dinâmico) aparece — nenhum `<pre><code>`.
    expect(screen.getByRole("status", { name: "Desenhando diagrama" })).toBeInTheDocument();
  });

  it("o registry tem precedência mesmo quando a linguagem também é realçável", () => {
    // `sql` está na lista de realce **e** ganha um renderer: quem manda é o renderer, e o texto
    // cru do fence chega nele inteiro.
    blockRenderers.sql = DemoBlock;
    render(<MarkdownPreview content={"```sql\nSELECT 1\n```"} />);

    expect(screen.getByTestId("demo-block")).toHaveTextContent("demo:SELECT 1");
    delete blockRenderers.sql;
  });

  it("bloco com renderer registrado recebe a classe que desliga o realce", () => {
    blockRenderers.demo = DemoBlock;
    const { container } = render(
      <MarkdownPreview
        content={"```demo\nx\n```"}
        components={{
          // Espia a `className` que chega ao `code` sem deixar o renderer engolir o elemento.
          pre: ({ children }) => <pre data-testid="raw-pre">{children}</pre>,
          code: (props) => <code className={props.className}>{props.children}</code>,
        }}
      />
    );

    expect(codeOf(container).className).toContain(NO_HIGHLIGHT_CLASS);
  });

  /**
   * Contrato com o menu de inserção da 068: toda linguagem que o `/` oferece **tem** que sair
   * realçada. Oferecer "Código Erlang" num menu e entregar texto cinza é prometer o que o
   * renderizador não cumpre — e as duas listas moram em arquivos diferentes de propósito (o menu
   * vive no chunk do CodeMirror e não pode importar as gramáticas do highlight.js), então é este
   * teste que as mantém casadas.
   */
  const MENU_LANGUAGE_SAMPLE: Record<string, string> = {
    ts: "const a: number = 1;",
    tsx: "const x = <a href=\"y\">t</a>;",
    js: "function f() { return 1; }",
    json: '{"a": 1}',
    sql: "SELECT 1 FROM t;",
    bash: 'echo "oi"',
    python: "def f():\n    return 1",
    css: "a { color: red; }",
    html: '<a href="x">t</a>',
    markdown: "# Título",
    diff: "+ adicionado\n- removido",
  };

  it("o menu `/` não oferece linguagem sem amostra neste teste", () => {
    // Acrescentar uma linguagem em `CODE_BLOCK_LANGUAGES` sem provar que ela realça falha aqui.
    expect(CODE_BLOCK_LANGUAGES.map((language) => language.id).sort()).toEqual(
      Object.keys(MENU_LANGUAGE_SAMPLE).sort()
    );
  });

  it.each(CODE_BLOCK_LANGUAGES.map((language) => [language.id, language.label]))(
    "a linguagem `%s` (%s), oferecida pelo menu `/`, sai realçada",
    (id) => {
      const { container } = render(
        <MarkdownPreview
          content={"```" + id + "\n" + MENU_LANGUAGE_SAMPLE[id] + "\n```"}
        />
      );

      const tokens = [...codeOf(container).querySelectorAll("span")].filter((span) =>
        span.className.startsWith("hljs-")
      );
      expect(tokens.length).toBeGreaterThan(0);
    }
  );
});

/**
 * O realce sai do parser com as classes certas — mas classe sem cor é realce nenhum, e nada no
 * build acusaria isso. Como a skill `next` proíbe conferir no navegador, a prova é o CSS: as
 * classes que os testes acima afirmam no HTML precisam existir na folha de estilo, pintadas com
 * token do app (e não com cor fixa de um tema do highlight.js, que não seguiria o dark mode).
 */
describe("tema do realce em src/index.css", () => {
  // `import.meta.url` vira `http://localhost/` no jsdom — o caminho sai do cwd, que o Vitest
  // ancora na raiz do projeto.
  const css = readFileSync("src/index.css", "utf8");

  it.each([
    ".hljs-keyword",
    ".hljs-string",
    ".hljs-number",
    ".hljs-comment",
    ".hljs-title",
    ".hljs-deletion",
    ".hljs-addition",
  ])("%s tem regra própria", (selector) => {
    expect(new RegExp(`\\${selector}[,\\s{]`).test(css)).toBe(true);
  });

  it("as cores do realce saem de token do app, não de paleta fixa", () => {
    const block = css.slice(css.indexOf(".hljs {"));
    const colors = [...block.matchAll(/(?:^|[\s;{])color:\s*([^;]+);/gm)].map((m) =>
      m[1].trim()
    );

    expect(colors.length).toBeGreaterThan(5);
    for (const color of colors) expect(color).toMatch(/^hsl\(var\(--[a-z0-9-]+\)\)$/);
  });

  it("não importa CSS de tema do highlight.js", () => {
    expect(css).not.toContain("highlight.js/styles");
  });
});
