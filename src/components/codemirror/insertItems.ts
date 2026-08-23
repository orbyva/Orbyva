import {
  CALLOUT_LABEL,
  CALLOUT_TYPES,
} from "@/components/markdown/remarkCallout";
import { CODE_BLOCK_LANGUAGES } from "@/domain/notes/blockLanguage";
import { CANVAS_BLOCK_LANGUAGE } from "@/domain/notes/canvasScene";
import { MERMAID_SNIPPET } from "@/domain/notes/mermaidSnippet";
import { formatLocalIsoDate } from "@/lib/dates";

/**
 * # O catálogo do menu de inserção (feature 068)
 *
 * Só dados: rótulo, dica, palavras de busca e o texto que entra no documento. Quem os apresenta é
 * o `slashMenu.ts` (o `/` do autocomplete) — e é de propósito que o catálogo não saiba disso, para
 * a barra de ferramentas poder oferecer a mesma lista sem duplicar uma linha de Markdown.
 *
 * **Nada aqui inventa sintaxe.** Callout vem de `CALLOUT_TYPES`/`CALLOUT_LABEL` (067), a linguagem
 * do bloco de canvas de `CANVAS_BLOCK_LANGUAGE` (058), o diagrama do `MERMAID_SNIPPET` (057) e as
 * linguagens de código de `CODE_BLOCK_LANGUAGES` (067). Se a sintaxe mudar do lado do
 * renderizador, o menu muda junto; um item que ofereça sintaxe que o preview não entende é pior do
 * que item nenhum.
 */
export type InsertItem = {
  id: string;
  /** O que o usuário lê no menu. */
  label: string;
  /** Dica curta à direita — quase sempre a própria sintaxe, que é como se aprende a escrever. */
  detail: string;
  /** Termos extras de busca (sem acento): "h1" acha "Título 1", "mermaid" acha "Diagrama". */
  keywords: readonly string[];
  /** O texto inserido no documento. */
  snippet: string;
  /** Onde o cursor para, contado do início do trecho. */
  cursorOffset: number;
  /**
   * Item que ocupa a linha inteira. Precisa de linha em branco antes quando há texto logo acima —
   * senão `---` transforma o parágrafo anterior num título (setext) e a tabela do GFM não é
   * reconhecida por não conseguir interromper um parágrafo.
   */
  block: boolean;
};

/** `$$…$$` — sintaxe portátil de fórmula em bloco (GitHub, Obsidian), lida pelo `remark-math`. */
const MATH_FENCE = "$$";

/**
 * Tabela 3×3 com as células vazias e o cursor na primeira: um esqueleto com "Coluna 1" escrito
 * dentro obrigaria a apagar o texto de exemplo célula por célula.
 */
const TABLE_SNIPPET = ["|  |  |  |", "| --- | --- | --- |", "|  |  |  |", "|  |  |  |", ""].join(
  "\n"
);

/**
 * O catálogo. É uma função (e não uma constante) por causa de um único item — "Data de hoje" —,
 * que depende de *quando* o menu foi aberto. Receber a data por parâmetro é o que permite testar
 * esse item sem congelar o relógio do processo.
 */
export function createInsertItems(now: Date = new Date()): readonly InsertItem[] {
  return [
    heading(1),
    heading(2),
    heading(3),
    line("lista", "Lista", "- ", ["bullet", "topico", "item"]),
    line("lista-numerada", "Lista numerada", "1. ", ["ordenada", "numero"]),
    line("checklist", "Checklist", "- [ ] ", ["tarefa", "todo", "caixa"]),
    line("citacao", "Citação", "> ", ["quote", "blockquote"]),
    ...CALLOUT_TYPES.map((type) => {
      const trigger = `> [!${type.toUpperCase()}]`;
      return {
        id: `callout-${type}`,
        label: `Callout: ${CALLOUT_LABEL[type]}`,
        detail: trigger,
        keywords: ["callout", "alerta", "aviso", "caixa", type],
        snippet: `${trigger}\n> `,
        cursorOffset: `${trigger}\n> `.length,
        block: true,
      } satisfies InsertItem;
    }),
    {
      id: "tabela",
      label: "Tabela",
      detail: "3 × 3",
      keywords: ["table", "grade", "coluna"],
      snippet: TABLE_SNIPPET,
      // Dentro da primeira célula do cabeçalho: `|` + espaço.
      cursorOffset: 2,
      block: true,
    },
    {
      id: "codigo",
      label: "Bloco de código",
      detail: "```",
      keywords: ["code", "fence", "trecho"],
      snippet: "```\n\n```\n",
      cursorOffset: "```\n".length,
      block: true,
    },
    ...CODE_BLOCK_LANGUAGES.map((language) => ({
      id: `codigo-${language.id}`,
      label: `Código ${language.label}`,
      detail: `\`\`\`${language.id}`,
      keywords: ["code", "bloco", language.id],
      snippet: `\`\`\`${language.id}\n\n\`\`\`\n`,
      cursorOffset: `\`\`\`${language.id}\n`.length,
      block: true,
    })),
    {
      id: "formula",
      label: "Fórmula",
      detail: `${MATH_FENCE}…${MATH_FENCE}`,
      keywords: ["math", "latex", "katex", "equacao"],
      snippet: `${MATH_FENCE}\n\n${MATH_FENCE}\n`,
      cursorOffset: `${MATH_FENCE}\n`.length,
      block: true,
    },
    {
      id: "diagrama",
      label: "Diagrama",
      detail: "```mermaid",
      keywords: ["mermaid", "fluxo", "grafo"],
      // O esqueleto da 057 já é um diagrama **válido**: colar e ver o desenho é o que ensina a
      // sintaxe. O cursor fica no fim, pronto para editar a última aresta.
      snippet: `${MERMAID_SNIPPET}\n`,
      cursorOffset: MERMAID_SNIPPET.length,
      block: true,
    },
    {
      id: "canvas",
      label: "Referência de canvas",
      detail: `\`\`\`${CANVAS_BLOCK_LANGUAGE}`,
      keywords: ["desenho", "excalidraw", "quadro"],
      // O id da nota-canvas é colado na linha do meio (a ação "Copiar referência" da 058 põe o
      // bloco inteiro na área de transferência; aqui o esqueleto espera só o id).
      snippet: `\`\`\`${CANVAS_BLOCK_LANGUAGE}\n\n\`\`\`\n`,
      cursorOffset: `\`\`\`${CANVAS_BLOCK_LANGUAGE}\n`.length,
      block: true,
    },
    {
      id: "wikilink",
      label: "Link para outra nota",
      detail: "[[…]]",
      keywords: ["wikilink", "nota", "referencia"],
      // Deixa o cursor entre os colchetes: o autocomplete de `[[` da 056 assume daqui.
      snippet: "[[]]",
      cursorOffset: 2,
      block: false,
    },
    {
      id: "data-hoje",
      label: "Data de hoje",
      detail: formatLocalIsoDate(now),
      keywords: ["hoje", "date", "dia"],
      snippet: formatLocalIsoDate(now),
      cursorOffset: formatLocalIsoDate(now).length,
      block: false,
    },
    {
      id: "linha",
      label: "Linha horizontal",
      detail: "---",
      keywords: ["separador", "divisor", "hr"],
      snippet: "---\n",
      cursorOffset: 4,
      block: true,
    },
  ];
}

function heading(level: 1 | 2 | 3): InsertItem {
  const marker = `${"#".repeat(level)} `;
  return {
    id: `titulo-${level}`,
    label: `Título ${level}`,
    detail: marker.trim(),
    keywords: [`h${level}`, "heading", "cabecalho", "secao"],
    snippet: marker,
    cursorOffset: marker.length,
    block: true,
  };
}

function line(
  id: string,
  label: string,
  marker: string,
  keywords: readonly string[]
): InsertItem {
  return {
    id,
    label,
    detail: marker.trim(),
    keywords,
    snippet: marker,
    cursorOffset: marker.length,
    block: true,
  };
}
