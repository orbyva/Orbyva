import type { Blockquote, Nodes, Paragraph, Root, Text } from "mdast";

/**
 * # Callout — o dialeto de alerta do GitHub dentro das notas (feature 067)
 *
 * ```md
 * > [!WARNING] Prazo do cartório
 * > A escritura vence dia 30.
 * ```
 *
 * Vira uma caixa com ícone e cor, em vez de uma citação cinza. A sintaxe é a do GitHub — cinco
 * tipos, palavra-chave entre colchetes na **primeira linha** de um blockquote — mais o título
 * opcional na mesma linha, que é a boa ideia emprestada do Obsidian.
 *
 * **Por que não `remark-directive`/`:::note`**: seria uma dependência a mais e uma sintaxe que o
 * usuário não encontra em lugar nenhum fora deste app. O dialeto do GitHub degrada com elegância —
 * em qualquer outro renderizador o texto continua sendo uma citação legível, não um `:::note` cru
 * na tela.
 *
 * O plugin **não** gera HTML: ele só marca o nó (`data-callout`, `data-callout-title`), e quem
 * desenha é o `CalloutBlock` via `components.blockquote`. Isso é o que mantém a decisão da 055 de
 * pé — nada aqui abre caminho para HTML cru, e o título continua sendo texto, nunca markup.
 */
export const CALLOUT_TYPES = [
  "note",
  "tip",
  "important",
  "warning",
  "caution",
] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];

/**
 * Rótulo em português por tipo — é o que aparece quando o usuário não escreve título próprio.
 * Mora aqui, e não no `CalloutBlock`, para o componente exportar só componente (regra do
 * `react-refresh/only-export-components`).
 */
export const CALLOUT_LABEL: Record<CalloutType, string> = {
  note: "Nota",
  tip: "Dica",
  important: "Importante",
  warning: "Atenção",
  caution: "Cuidado",
};

/** O tipo chega como atributo de DOM (string qualquer): confere antes de indexar mapa nenhum. */
export function parseCalloutType(value: unknown): CalloutType | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  return isCalloutType(normalized) ? normalized : null;
}

/** Atributo que o `CalloutBlock` lê para saber que aquele blockquote virou callout. */
export const CALLOUT_TYPE_ATTR = "data-callout";
/** Título opcional escrito na mesma linha do `[!TIPO]`. Texto puro, nunca markup. */
export const CALLOUT_TITLE_ATTR = "data-callout-title";

/**
 * `[!TIPO]` no começo da linha, com o resto da linha virando título.
 * `(.*)` não casa `\n` de propósito: o título é só a primeira linha.
 */
const CALLOUT_RE = /^\[!([A-Za-z]+)\][ \t]*(.*)(?:\n|$)/;

function isCalloutType(value: string): value is CalloutType {
  return (CALLOUT_TYPES as readonly string[]).includes(value);
}

/**
 * Plugin remark: marca todo blockquote que começa com `[!TIPO]`.
 *
 * Escrito sem `unist-util-visit` de propósito — a travessia é meia dúzia de linhas e o módulo fica
 * puro e testável sozinho, no mesmo estilo de `src/domain/notes/`.
 */
export function remarkCallout() {
  return function transform(tree: Root): void {
    visitNodes(tree, (node) => {
      if (node.type === "blockquote") markCallout(node);
    });
  };
}

function visitNodes(node: Nodes, onNode: (node: Nodes) => void): void {
  onNode(node);
  const children = "children" in node ? node.children : undefined;
  if (!children) return;
  for (const child of children) visitNodes(child as Nodes, onNode);
}

/**
 * Marca o blockquote **e consome a linha do gatilho**, para o `[!NOTE]` não aparecer no texto.
 * Blockquote que não começa com um dos cinco tipos sai daqui intocado — `[!FOO]` continua sendo
 * uma citação com um `[!FOO]` literal dentro, que é como o GitHub também se comporta.
 */
function markCallout(node: Blockquote): void {
  const paragraph = node.children[0];
  if (!paragraph || paragraph.type !== "paragraph") return;

  const first = paragraph.children[0];
  if (!first || first.type !== "text") return;

  const match = CALLOUT_RE.exec(first.value);
  if (!match) return;

  const type = match[1].toLowerCase();
  if (!isCalloutType(type)) return;

  const title = match[2].trim();
  consumeTriggerLine(node, paragraph, first, match[0].length);

  node.data = {
    ...node.data,
    hProperties: {
      ...(node.data?.hProperties ?? {}),
      [CALLOUT_TYPE_ATTR]: type,
      ...(title ? { [CALLOUT_TITLE_ATTR]: title } : {}),
    },
  };
}

/**
 * Tira o `[!TIPO] Título\n` do texto. Se aquilo era o parágrafo inteiro (callout de uma linha só,
 * sem corpo), o parágrafo vazio some — senão sobraria um espaço em branco dentro da caixa.
 */
function consumeTriggerLine(
  node: Blockquote,
  paragraph: Paragraph,
  first: Text,
  consumed: number
): void {
  const rest = first.value.slice(consumed);
  if (rest) {
    first.value = rest;
    return;
  }
  paragraph.children.shift();
  // Parágrafo que só continha o gatilho vira um `<p>` vazio dentro da caixa — fora com ele.
  if (paragraph.children.length === 0) node.children.shift();
}
