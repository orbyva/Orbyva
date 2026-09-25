import type { Blockquote, Nodes, Root } from "mdast";

/**
 * # `> [!NOTE]` — callouts/admonitions sem dependência nova (feature 069)
 *
 * `> [!NOTE] …` é a sintaxe que o GitHub chama de *alert* e o Obsidian de *callout*. As duas
 * escrevem o mesmo texto, e é por isso que ela foi escolhida: a nota continua legível (e portável)
 * em qualquer editor de Markdown — sem marcador reconhecido ela é apenas uma citação comum, que é
 * exatamente como o resto do mundo já a renderiza.
 *
 * O plugin é local de propósito. `> [!NOTE]` já é um `blockquote` válido para o CommonMark: não há
 * gramática nova para escrever, só um marcador a reconhecer no primeiro parágrafo. Então aqui não
 * se mexe no parser — só se **anota** o nó (`data.hProperties['data-callout']`, que o
 * `mdast-util-to-hast` transforma no atributo do `<blockquote>`) e se tira o marcador do texto. Todo
 * o desenho mora no CSS (`.markdown-body [data-callout]`, em `src/index.css`).
 *
 * Três garantias que este arquivo mantém, e que os testes vigiam:
 *
 * 1. **Tipo desconhecido não some**: `> [!FOO]` continua um blockquote normal, com o texto
 *    `[!FOO]` visível. O usuário vê o que escreveu em vez de um bloco vazio.
 * 2. **Nada de conteúdo se perde**: só o marcador é removido, e só quando ele abre o bloco.
 *    Marcador no meio do texto não conta.
 * 3. **Nenhum HTML cru entra**: o plugin devolve o mesmo mdast, com um atributo a mais. É o que
 *    permite a invariante da 055 (`rehype-raw` desligado) continuar verdadeira.
 */

/** Os cinco tipos do GitHub. O Obsidian tem mais, mas estes são os que as duas bases compartilham. */
export const CALLOUT_TYPES = [
  "note",
  "tip",
  "important",
  "warning",
  "caution",
] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];

/**
 * `[!TIPO]` abrindo o bloco, com o espaço que costuma vir depois dele. Ancorado no início de
 * propósito: é o que faz "marcador no meio do texto não conta".
 */
const CALLOUT_MARKER_RE = /^\[!([A-Za-z]+)\][ \t]*/;

const CALLOUT_TYPE_SET = new Set<string>(CALLOUT_TYPES);

/**
 * Plugin remark: anota os blockquotes que abrem com `> [!TIPO]` e tira o marcador do texto.
 * Registrado em `MARKDOWN_REMARK_PLUGINS` (`remarkPlugins.ts`), vale para todo Markdown do app.
 */
export function remarkCallout() {
  return (tree: Root): void => {
    visitBlockquotes(tree, annotateCallout);
  };
}

/**
 * Caminhada recursiva pela árvore. Não usa `unist-util-visit` porque ele chegaria aqui como
 * dependência transitiva do `react-markdown` — e a alternativa cabe em seis linhas. Callout dentro
 * de lista, de outro callout ou de citação aninhada é alcançado igual.
 */
function visitBlockquotes(node: Nodes, visitor: (node: Blockquote) => void): void {
  if (node.type === "blockquote") visitor(node);
  if ("children" in node) {
    for (const child of node.children) visitBlockquotes(child, visitor);
  }
}

function annotateCallout(node: Blockquote): void {
  const paragraph = node.children[0];
  if (!paragraph || paragraph.type !== "paragraph") return;

  const opening = paragraph.children[0];
  if (!opening || opening.type !== "text") return;

  const match = CALLOUT_MARKER_RE.exec(opening.value);
  if (!match) return;

  const type = match[1].toLowerCase();
  // Tipo que não conhecemos volta a ser citação comum — com o `[!FOO]` ainda na tela.
  if (!CALLOUT_TYPE_SET.has(type)) return;

  /**
   * O corpo costuma vir na linha seguinte (`> [!NOTE]\n> texto`), e no mdast a quebra leve é um
   * `\n` dentro do próprio texto. Removê-la evita o bloco começar com uma linha em branco. Título
   * na mesma linha (jeito do Obsidian, `> [!NOTE] Atenção`) é mantido como primeira linha do corpo.
   */
  const rest = opening.value.slice(match[0].length).replace(/^\n/, "");
  opening.value = rest;

  // `> [!NOTE]` sozinho: sem isto sobraria um parágrafo vazio abrindo o callout.
  if (rest === "") {
    paragraph.children.shift();
    if (paragraph.children.length === 0) node.children.shift();
  }

  node.data = {
    ...node.data,
    hProperties: { ...node.data?.hProperties, "data-callout": type },
  };
}
