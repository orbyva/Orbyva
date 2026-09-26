import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Blockquote, Code, Root } from "mdast";
import {
  CALLOUT_TITLE_ATTR,
  CALLOUT_TYPE_ATTR,
  CALLOUT_TYPES,
  remarkCallout,
} from "@/components/markdown/remarkCallout";

/**
 * O plugin é testado na árvore (mdast), não no HTML: é lá que ele age, e é lá que dá para afirmar
 * "este blockquote virou callout do tipo X **e** o `[!X]` sumiu do texto". A ponte com a tela é
 * afirmada em `CalloutBlock.test.tsx`.
 */
const processor = unified().use(remarkParse).use(remarkGfm).use(remarkCallout);

function parse(markdown: string): Root {
  return processor.runSync(processor.parse(markdown)) as Root;
}

function firstBlockquote(tree: Root): Blockquote {
  const node = tree.children.find((child) => child.type === "blockquote");
  if (!node) throw new Error("nenhum blockquote na árvore");
  return node as Blockquote;
}

function calloutProps(node: Blockquote): Record<string, unknown> {
  return (node.data?.hProperties ?? {}) as Record<string, unknown>;
}

/** Todo o texto de um nó, concatenado — para conferir que o gatilho foi consumido. */
function textOf(node: unknown): string {
  const candidate = node as { value?: string; children?: unknown[] };
  if (typeof candidate.value === "string") return candidate.value;
  return (candidate.children ?? []).map(textOf).join("");
}

describe("remarkCallout", () => {
  it.each(CALLOUT_TYPES)("reconhece `[!%s]`", (type) => {
    const upper = type.toUpperCase();
    const tree = parse(`> [!${upper}]\n> corpo do aviso`);
    const quote = firstBlockquote(tree);

    expect(calloutProps(quote)[CALLOUT_TYPE_ATTR]).toBe(type);
    // O gatilho não pode sobrar como texto na caixa.
    expect(textOf(quote)).toBe("corpo do aviso");
  });

  it("aceita o tipo em minúsculas (dialeto do Obsidian) e normaliza", () => {
    const quote = firstBlockquote(parse("> [!tip]\n> dica"));
    expect(calloutProps(quote)[CALLOUT_TYPE_ATTR]).toBe("tip");
  });

  it("tipo desconhecido continua sendo citação comum, com o texto literal", () => {
    const quote = firstBlockquote(parse("> [!FOO]\n> texto"));

    expect(calloutProps(quote)[CALLOUT_TYPE_ATTR]).toBeUndefined();
    expect(textOf(quote)).toBe("[!FOO]\ntexto");
  });

  it("`[!NOTE]` dentro de bloco de código não vira callout", () => {
    const tree = parse("```md\n> [!NOTE]\n> exemplo\n```");

    expect(tree.children.some((child) => child.type === "blockquote")).toBe(false);
    const code = tree.children[0] as Code;
    expect(code.type).toBe("code");
    expect(code.value).toBe("> [!NOTE]\n> exemplo");
  });

  it("`[!NOTE]` no meio do parágrafo (não na primeira linha) não vira callout", () => {
    const quote = firstBlockquote(parse("> aviso:\n> [!NOTE]\n> corpo"));

    expect(calloutProps(quote)[CALLOUT_TYPE_ATTR]).toBeUndefined();
  });

  it("título na primeira linha vira atributo, e não texto do corpo", () => {
    const quote = firstBlockquote(
      parse("> [!WARNING] Prazo do cartório\n> A escritura vence dia 30.")
    );

    expect(calloutProps(quote)).toMatchObject({
      [CALLOUT_TYPE_ATTR]: "warning",
      [CALLOUT_TITLE_ATTR]: "Prazo do cartório",
    });
    expect(textOf(quote)).toBe("A escritura vence dia 30.");
  });

  it("sem título, o atributo de título nem aparece", () => {
    const quote = firstBlockquote(parse("> [!NOTE]\n> só corpo"));
    expect(calloutProps(quote)).not.toHaveProperty(CALLOUT_TITLE_ATTR);
  });

  it("callout só de título não deixa parágrafo vazio para trás", () => {
    const quote = firstBlockquote(parse("> [!TIP] Atalho útil"));

    expect(calloutProps(quote)[CALLOUT_TITLE_ATTR]).toBe("Atalho útil");
    expect(quote.children).toHaveLength(0);
  });

  it("callout de várias linhas e com lista dentro preserva a estrutura", () => {
    const quote = firstBlockquote(
      parse(
        "> [!IMPORTANT]\n> Antes de assinar:\n>\n> - conferir a matrícula\n> - conferir o IPTU"
      )
    );

    expect(calloutProps(quote)[CALLOUT_TYPE_ATTR]).toBe("important");
    expect(quote.children.map((child) => child.type)).toEqual([
      "paragraph",
      "list",
    ]);
    const list = quote.children[1] as { children: unknown[] };
    expect(list.children).toHaveLength(2);
    expect(textOf(quote.children[0])).toBe("Antes de assinar:");
  });

  it("citação normal, sem colchetes, segue intocada", () => {
    const quote = firstBlockquote(parse("> só uma citação"));

    expect(quote.data?.hProperties).toBeUndefined();
    expect(textOf(quote)).toBe("só uma citação");
  });

  it("callout aninhado dentro de outra citação também é reconhecido", () => {
    const outer = firstBlockquote(parse("> > [!CAUTION]\n> > cuidado"));
    const inner = outer.children[0] as Blockquote;

    expect(calloutProps(inner)[CALLOUT_TYPE_ATTR]).toBe("caution");
  });
});
