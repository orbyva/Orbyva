import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";
import { startCompletion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";
import { TABLE_SNIPPET } from "@/components/codemirror/formattingKeymap";
import { isInsideCode } from "@/domain/notes/wikiLinks";
import { MERMAID_SNIPPET } from "@/domain/notes/mermaidSnippet";
import { CANVAS_BLOCK_LANGUAGE } from "@/domain/notes/canvasScene";
import { formatLocalIsoDate } from "@/lib/dates";

/**
 * # Menu `/` do editor de notas (feature 070)
 *
 * Digitar `/` no começo de uma linha abre a lista de blocos — título, lista, tabela, callout,
 * fórmula, diagrama… — como no Obsidian e no Notion. É o que faz a sintaxe rica ser **descoberta**
 * por quem não a conhece de cor.
 *
 * Não é um popover próprio: é uma segunda fonte do `autocompletion` que o editor já liga, ao lado
 * do `[[` da 056. Menos código, mesma navegação por teclado, mesmo comportamento de fechar no Esc.
 *
 * **Só dispara com `/` em início de linha.** Sem essa regra, o menu abriria dentro de `http://`,
 * de um caminho de arquivo e de qualquer data escrita `12/05` — e dentro de bloco de código, onde
 * `/` é conteúdo.
 */

/**
 * Onde o cursor para depois de inserir o snippet — some do texto inserido. Duas ocorrências marcam
 * um trecho **selecionado** (o "Coluna" da tabela, que o usuário troca digitando por cima).
 */
export const SNIPPET_CURSOR = "{{|}}";

export interface SlashCommand {
  /** Rótulo na lista. */
  label: string;
  /** Prévia da sintaxe, à direita do rótulo. */
  detail: string;
  /** Palavras que também casam na busca (sem acento, minúsculas). */
  keywords: string;
  /** Texto inserido, com `SNIPPET_CURSOR` onde o cursor deve parar (ou em volta do que selecionar). */
  snippet: string;
  /**
   * Bloco (precisa de linha em branco antes para o Markdown reconhecer) ou trecho de linha.
   * Tabela grudada num parágrafo vira texto com barras; citação, não.
   */
  block?: boolean;
  /** Reabre o autocomplete depois de inserir — o `[[` tem lista própria para oferecer. */
  retrigger?: boolean;
}

/** Itens do menu. `hoje` depende do relógio, por isso a lista é função e não constante. */
export function slashCommands(now: Date = new Date()): SlashCommand[] {
  return [
    {
      label: "Título",
      detail: "## ",
      keywords: "titulo cabecalho heading h2 secao",
      snippet: `## ${SNIPPET_CURSOR}`,
    },
    {
      label: "Lista",
      detail: "- ",
      keywords: "lista item bullet marcador",
      snippet: `- ${SNIPPET_CURSOR}`,
    },
    {
      label: "Lista de tarefas",
      detail: "- [ ] ",
      keywords: "tarefa checklist todo caixa",
      snippet: `- [ ] ${SNIPPET_CURSOR}`,
    },
    {
      label: "Tabela",
      detail: "| … | … |",
      keywords: "tabela grade colunas",
      // Os dois marcadores deixam "Coluna" **selecionado**: digitar troca o nome da coluna.
      snippet: TABLE_SNIPPET.replace(
        "| Coluna |",
        `| ${SNIPPET_CURSOR}Coluna${SNIPPET_CURSOR} |`
      ),
      block: true,
    },
    {
      label: "Citação",
      detail: "> ",
      keywords: "citacao quote blockquote",
      snippet: `> ${SNIPPET_CURSOR}`,
    },
    {
      label: "Callout",
      detail: "> [!NOTE]",
      keywords: "callout aviso nota destaque admonition",
      snippet: `> [!NOTE]\n> ${SNIPPET_CURSOR}`,
      block: true,
    },
    {
      label: "Bloco de código",
      detail: "```lang",
      keywords: "codigo code fence programa",
      snippet: "```ts\n" + SNIPPET_CURSOR + "\n```",
      block: true,
    },
    {
      label: "Fórmula",
      detail: "$$ … $$",
      keywords: "formula math latex katex equacao",
      snippet: `$$\n${SNIPPET_CURSOR}\n$$`,
      block: true,
    },
    {
      label: "Diagrama",
      detail: "```mermaid",
      keywords: "diagrama mermaid fluxograma grafico",
      snippet: `${MERMAID_SNIPPET}${SNIPPET_CURSOR}`,
      block: true,
    },
    {
      label: "Canvas",
      detail: "```" + CANVAS_BLOCK_LANGUAGE,
      keywords: "canvas desenho quadro excalidraw",
      snippet: "```" + CANVAS_BLOCK_LANGUAGE + "\n" + SNIPPET_CURSOR + "\n```",
      block: true,
    },
    {
      label: "Data de hoje",
      detail: formatLocalIsoDate(now),
      keywords: "data hoje dia agora",
      snippet: `${formatLocalIsoDate(now)}${SNIPPET_CURSOR}`,
    },
    {
      label: "Link de nota",
      detail: "[[…]]",
      keywords: "link nota wiki referencia",
      snippet: `[[${SNIPPET_CURSOR}]]`,
      retrigger: true,
    },
  ];
}

/**
 * Separa o texto do snippet das posições de cursor dentro dele. Sem marcador, o cursor vai para o
 * fim; com dois, o trecho entre eles fica selecionado.
 */
export function expandSnippet(snippet: string): {
  text: string;
  from: number;
  to: number;
} {
  const at = snippet.indexOf(SNIPPET_CURSOR);
  if (at === -1) return { text: snippet, from: snippet.length, to: snippet.length };
  const rest = snippet.slice(0, at) + snippet.slice(at + SNIPPET_CURSOR.length);
  const end = rest.indexOf(SNIPPET_CURSOR, at);
  if (end === -1) return { text: rest, from: at, to: at };
  return {
    text: rest.slice(0, end) + rest.slice(end + SNIPPET_CURSOR.length),
    from: at,
    to: end,
  };
}

/** `/` no começo da linha (só espaço antes) seguido do que já foi digitado, sem espaço. */
const SLASH_PREFIX_RE = /^[ \t]*\/[\p{L}\p{N}]*$/u;

/** Busca sem acento e sem caixa: quem digita "/formula" acha "Fórmula". */
function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function matches(command: SlashCommand, query: string): boolean {
  if (!query) return true;
  return foldText(`${command.label} ${command.keywords}`).includes(query);
}

/**
 * A fonte de autocomplete do menu `/`.
 *
 * `now` é injetável para o teste da "data de hoje" não depender do relógio da máquina.
 */
export function slashCommandSource(now: () => Date = () => new Date()): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(SLASH_PREFIX_RE);
    if (!before) return null;

    const slashAt = before.from + before.text.indexOf("/");
    const doc = context.state.doc.toString();
    // Dentro de fence ou de código inline, `/` é conteúdo — a mesma regra que vale para `[[`.
    if (isInsideCode(doc, slashAt)) return null;

    const query = foldText(before.text.slice(before.text.indexOf("/") + 1));
    const options: Completion[] = [];

    for (const command of slashCommands(now())) {
      if (!matches(command, query)) continue;
      options.push({
        label: command.label,
        detail: command.detail,
        type: "keyword",
        apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
          applySlashCommand(view, command, from, to);
        },
      });
    }

    if (options.length === 0) return null;
    return {
      from: slashAt,
      options,
      /**
       * A lista é filtrada aqui (por rótulo **e** por palavra-chave, sem acento), então o filtro do
       * CodeMirror fica de fora: ele compararia os rótulos com o texto `"/tab"`, barra inclusive, e
       * nenhum casaria.
       */
      filter: false,
    };
  };
}

/**
 * Escreve o snippet no lugar do `/…`, com linha em branco antes quando o bloco precisa.
 *
 * Exportada para o teste conseguir afirmar o documento resultante sem simular o popup inteiro.
 */
export function applySlashCommand(
  view: EditorView,
  command: SlashCommand,
  from: number,
  to: number
): void {
  const doc = view.state.doc.toString();
  // Bloco colado no parágrafo de cima não é reconhecido pelo Markdown (tabela vira texto com
  // barras, fence vira parágrafo). A linha em branco só entra quando falta.
  const needsBlankLine =
    command.block === true && from > 0 && !/\n\s*\n$|^\s*$/.test(doc.slice(0, from));
  const prefix = needsBlankLine ? "\n" : "";
  const snippet = expandSnippet(command.snippet);
  const start = from + prefix.length;

  view.dispatch({
    changes: { from, to, insert: prefix + snippet.text },
    selection: { anchor: start + snippet.from, head: start + snippet.to },
    scrollIntoView: true,
    userEvent: "input.complete",
  });

  // O `[[` tem uma lista própria de notas para oferecer: abri-la é o passo seguinte óbvio.
  if (command.retrigger) startCompletion(view);
}

/** A extensão pronta para o editor, pendurada na linguagem markdown (como o `[[` da 056). */
export function slashCommandAutocomplete(now?: () => Date): Extension {
  return markdownSupport.language.data.of({
    autocomplete: slashCommandSource(now),
  });
}
