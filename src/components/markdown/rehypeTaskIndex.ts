import type { Element, Nodes, Root } from "hast";

/**
 * Numera as caixas de tarefa do documento, na ordem em que aparecem (feature 070).
 *
 * Cada `<input type="checkbox">` que o `remark-gfm` cria a partir de `- [ ]` ganha um
 * `data-task-index`. É esse número que o clique devolve para `toggleTaskListItem`, que conta as
 * caixas do **texto** na mesma ordem — as duas pontas da mesma chave.
 *
 * É plugin de árvore, e não contador dentro do componente, pelo mesmo motivo do `rehypeHeadingIds`
 * (069): só quem percorre o documento inteiro, uma vez, em ordem, pode numerar. Um contador
 * mutável dentro do render seria refeito a cada re-render e dependeria da ordem em que o React
 * chama os componentes.
 */
export const TASK_INDEX_ATTR = "data-task-index";

export function rehypeTaskIndex() {
  return (tree: Root): void => {
    let index = 0;
    visit(tree, (node) => {
      if (node.tagName !== "input") return;
      if (node.properties?.type !== "checkbox") return;
      const properties = node.properties ?? (node.properties = {});
      properties[TASK_INDEX_ATTR] = index;
      index += 1;
    });
  };
}

function visit(node: Nodes, visitor: (element: Element) => void): void {
  if (node.type === "element") visitor(node);
  if ("children" in node) {
    for (const child of node.children) visit(child, visitor);
  }
}
