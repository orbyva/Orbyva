import type { Element, Nodes, Root } from "hast";
import { findBlockRenderer } from "@/components/markdown/blockRegistry";

/** Classe que o `rehype-highlight` respeita como "não mexa neste bloco". */
export const NO_HIGHLIGHT_CLASS = "no-highlight";

/**
 * Dá precedência ao `blockRegistry` (feature 057) sobre o realce de sintaxe (feature 067).
 *
 * ` ```mermaid ` e ` ```orbyva-canvas ` não são código para ler: são desenho. O renderer deles
 * recebe o **texto cru** do fence, e o `rehype-highlight` destruiria isso — ele troca o texto do
 * `<code>` por uma árvore de `<span class="hljs-…">`, e o `blockCode()` do `MarkdownPreview`, que
 * só sabe concatenar string, devolveria vazio. O diagrama sumiria sem erro nenhum: exatamente o
 * tipo de falha silenciosa que este plugin existe para impedir.
 *
 * A marcação é a classe `no-highlight`, que é o contrato público do próprio `rehype-highlight` —
 * mais estável do que reordenar plugins ou manter uma segunda lista de linguagens em paralelo.
 * Ler o registry **em tempo de execução** (e não uma cópia congelada na criação do plugin) é o que
 * faz um renderer registrado depois — como o teste do registry faz — já sair protegido.
 */
export function rehypeSkipRegisteredBlocks() {
  return function transform(tree: Root): void {
    visitElements(tree, (node) => {
      if (node.tagName !== "code") return;
      const className = node.properties?.className;
      if (findBlockRenderer(classNameToString(className)) === null) return;

      node.properties = node.properties ?? {};
      node.properties.className = [
        ...(Array.isArray(className) ? className : []),
        NO_HIGHLIGHT_CLASS,
      ];
    });
  };
}

function visitElements(node: Nodes, onElement: (node: Element) => void): void {
  if (node.type === "element") onElement(node);
  const children = "children" in node ? node.children : undefined;
  if (!children) return;
  for (const child of children) visitElements(child as Nodes, onElement);
}

/** A `className` do hast é array, mas pode chegar como string — `parseBlockLanguage` quer string. */
function classNameToString(value: unknown): string | null {
  if (Array.isArray(value)) return value.join(" ");
  return typeof value === "string" ? value : null;
}
