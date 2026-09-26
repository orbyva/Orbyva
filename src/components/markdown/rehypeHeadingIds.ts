import type { Element, Nodes, Root } from "hast";
import { slugifyHeading, uniqueHeadingId } from "@/domain/notes/headings";

/**
 * Põe um `id` estável em cada `h1`–`h6` do documento (feature 069).
 *
 * É um plugin de **árvore**, e não um override de componente, por um motivo só: unicidade. Dois
 * títulos iguais na mesma nota precisam virar `secao` e `secao-2`, e um componente de título não
 * enxerga os irmãos — ele veria o mesmo texto duas vezes e geraria o mesmo `id`, fazendo o link
 * levar sempre ao primeiro. Aqui a nota é percorrida inteira, em ordem, com um contador só.
 *
 * **Título que já tem `id` é deixado em paz.** O `remark-gfm` escreve o seu em
 * `<h2 id="footnote-label">` (o rótulo invisível da seção de rodapé) e sobrescrevê-lo quebraria o
 * `aria-labelledby` que aponta para ele.
 *
 * O `#` clicável ao lado do título **não** é montado aqui: ele é desenhado pelo override de
 * componente, em `MarkdownPreview`. Motivo: um `<a>` posto na árvore passaria pelo override de
 * `a` de quem consome o preview — no módulo de Notas, o de wiki-link (056), que manda todo link
 * externo abrir em outra aba. Âncora de seção abrindo uma aba nova é o oposto do que ela é.
 */
export function rehypeHeadingIds() {
  return (tree: Root): void => {
    const used = new Map<string, number>();
    visitHeadings(tree, (heading) => {
      const properties = heading.properties ?? (heading.properties = {});
      if (typeof properties.id === "string" && properties.id) return;
      properties.id = uniqueHeadingId(slugifyHeading(hastText(heading)), used);
    });
  };
}

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function visitHeadings(node: Nodes, visitor: (heading: Element) => void): void {
  if (node.type === "element" && HEADING_TAGS.has(node.tagName)) visitor(node);
  if ("children" in node) {
    for (const child of node.children) visitHeadings(child, visitor);
  }
}

/** Todo o texto do título, na ordem — `## Um **título**` vale "Um título". */
function hastText(node: Nodes): string {
  if (node.type === "text") return node.value;
  if (!("children" in node)) return "";
  return node.children.map(hastText).join("");
}
