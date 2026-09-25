import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Blockquote, Nodes, Root } from "mdast";
import {
  CALLOUT_TYPES,
  remarkCallout,
} from "@/components/markdown/remarkCallout";

/**
 * O plugin é testado contra Markdown de verdade, não contra uma árvore montada à mão: o que
 * importa é o que acontece com `> [!NOTE]` escrito numa nota, e uma árvore fabricada aqui provaria
 * só que o código concorda com a minha suposição de como o remark parseia citação.
 */
const processor = unified().use(remarkParse).use(remarkCallout);

function parse(markdown: string): Root {
  // `runSync` é tipado como `Node` genérico; o processador aqui só tem plugins de mdast.
  return processor.runSync(processor.parse(markdown)) as Root;
}

function firstBlockquote(node: Nodes): Blockquote | null {
  if (node.type === "blockquote") return node;
  if (!("children" in node)) return null;
  for (const child of node.children) {
    const found = firstBlockquote(child);
    if (found) return found;
  }
  return null;
}

function calloutOf(markdown: string): string | undefined {
  const quote = firstBlockquote(parse(markdown));
  const properties = quote?.data?.hProperties as
    | Record<string, unknown>
    | undefined;
  return properties?.["data-callout"] as string | undefined;
}

/** Todo o texto do nó, na ordem — é como se confere que nada sumiu do callout. */
function textOf(node: Nodes | null | undefined): string {
  if (!node) return "";
  if ("value" in node && typeof node.value === "string") return node.value;
  if (!("children" in node)) return "";
  return node.children.map(textOf).join("");
}

describe("remarkCallout", () => {
  it.each(CALLOUT_TYPES)("reconhece > [!%s] e anota o blockquote", (tipo) => {
    const markdown = `> [!${tipo.toUpperCase()}]\n> o corpo do aviso`;

    expect(calloutOf(markdown)).toBe(tipo);
    expect(textOf(firstBlockquote(parse(markdown)))).toBe("o corpo do aviso");
  });

  it("aceita o marcador em minúscula (jeito do Obsidian)", () => {
    expect(calloutOf("> [!tip]\n> dica")).toBe("tip");
  });

  it("tipo desconhecido continua citação comum, com o marcador visível", () => {
    const markdown = "> [!FOO]\n> texto qualquer";

    expect(calloutOf(markdown)).toBeUndefined();
    // O usuário vê o que escreveu — nada de bloco vazio por causa de um tipo errado.
    expect(textOf(firstBlockquote(parse(markdown)))).toBe(
      "[!FOO]\ntexto qualquer"
    );
  });

  it("blockquote sem marcador não é tocado", () => {
    const markdown = "> uma citação de sempre";
    const quote = firstBlockquote(parse(markdown));

    expect(quote?.data).toBeUndefined();
    expect(textOf(quote)).toBe("uma citação de sempre");
  });

  it("marcador no meio do texto não conta", () => {
    const markdown = "> olha o [!NOTE] aqui no meio";

    expect(calloutOf(markdown)).toBeUndefined();
    expect(textOf(firstBlockquote(parse(markdown)))).toBe(
      "olha o [!NOTE] aqui no meio"
    );
  });

  it("marcador fora de citação (parágrafo solto) não vira callout", () => {
    const tree = parse("[!NOTE] isto é um parágrafo");

    expect(firstBlockquote(tree)).toBeNull();
    expect(textOf(tree)).toBe("[!NOTE] isto é um parágrafo");
  });

  it("título na mesma linha e corpo em vários parágrafos sobrevivem inteiros", () => {
    const markdown = "> [!WARNING] Cuidado\n> primeira linha\n>\n> segundo parágrafo";
    const quote = firstBlockquote(parse(markdown));

    expect(calloutOf(markdown)).toBe("warning");
    expect(quote?.children).toHaveLength(2);
    expect(textOf(quote)).toBe("Cuidado\nprimeira linha" + "segundo parágrafo");
  });

  it("formatação logo depois do marcador continua sendo formatação", () => {
    const quote = firstBlockquote(parse("> [!TIP] **forte** e o resto"));

    // O texto vazio que sobrou do marcador sai da árvore; o `strong` abre o parágrafo.
    const paragraph = quote?.children[0];
    expect(paragraph?.type).toBe("paragraph");
    expect(paragraph && "children" in paragraph && paragraph.children[0].type).toBe(
      "strong"
    );
    expect(textOf(quote)).toBe("forte e o resto");
  });

  it("marcador sozinho não deixa parágrafo vazio para trás", () => {
    const quote = firstBlockquote(parse("> [!IMPORTANT]"));

    expect(quote?.children).toHaveLength(0);
    expect(
      (quote?.data?.hProperties as Record<string, unknown>)["data-callout"]
    ).toBe("important");
  });

  it("callout dentro de lista também é alcançado", () => {
    const markdown = "- item\n\n  > [!NOTE]\n  > aninhado";

    expect(calloutOf(markdown)).toBe("note");
    expect(textOf(firstBlockquote(parse(markdown)))).toBe("aninhado");
  });

  it("callout aninhado em callout: os dois são anotados", () => {
    const tree = parse("> [!NOTE]\n> fora\n>\n> > [!WARNING]\n> > dentro");
    const outer = firstBlockquote(tree);
    const inner = outer?.children
      .map((child) => firstBlockquote(child))
      .find((found): found is Blockquote => found !== null);

    expect(
      (outer?.data?.hProperties as Record<string, unknown>)["data-callout"]
    ).toBe("note");
    expect(
      (inner?.data?.hProperties as Record<string, unknown>)["data-callout"]
    ).toBe("warning");
    expect(textOf(inner)).toBe("dentro");
  });
});
