import type { Element, Nodes, Root } from "hast";

/**
 * Atributo com a posição do checkbox na contagem da tela — a mesma que o
 * `toggleTaskListItem(content, index)` usa no domínio.
 */
export const TASK_INDEX_ATTR = "data-task-index";

/**
 * Numera os checkboxes da checklist do GFM, em ordem de documento (feature 067).
 *
 * O `MarkdownPreview` precisa dizer "o usuário clicou no **terceiro** `- [ ]`" para o domínio
 * reescrever a linha certa do Markdown. Contar no componente exigiria um contador vivo entre
 * renders — frágil justamente em React, que pode renderizar duas vezes. Aqui a contagem acontece
 * uma vez, na árvore já pronta, e vira um atributo: o número que o componente lê é o mesmo que o
 * DOM mostra.
 *
 * Ordem de documento e ordem no texto coincidem porque quem vira `<input>` é sempre um item de
 * lista do GFM — e o que está dentro de bloco de código nunca vira `<input>`, exatamente como o
 * `extractTaskListItems` também não o conta.
 */
export function rehypeTaskListIndex() {
  return function transform(tree: Root): void {
    let index = 0;
    visitElements(tree, (node) => {
      if (node.tagName !== "input") return;
      if (node.properties?.type !== "checkbox") return;
      node.properties[TASK_INDEX_ATTR] = String(index++);
    });
  };
}

function visitElements(node: Nodes, onElement: (node: Element) => void): void {
  if (node.type === "element") onElement(node);
  const children = "children" in node ? node.children : undefined;
  if (!children) return;
  for (const child of children) visitElements(child as Nodes, onElement);
}
