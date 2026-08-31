import { startCompletion } from "@codemirror/autocomplete";
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import type { EditorState, Extension, TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";
import { createInsertItems } from "@/components/codemirror/insertItems";
import type { InsertItem } from "@/components/codemirror/insertItems";
import { foldForSearch } from "@/domain/notes/filters";

/**
 * # O menu de inserção: `/` no começo da linha (feature 068)
 *
 * Digitar `/` abre a lista do que dá para inserir — título, callout, tabela, bloco de código,
 * fórmula, diagrama — com busca por texto. É a porta que faz o Markdown sofisticado da 067 existir
 * para quem não decorou a sintaxe.
 *
 * **É o mesmo maquinário do `[[` da 056**, o `@codemirror/autocomplete`, e não um popup próprio.
 * Um popup próprio exigiria posicionar um portal sobre o cursor do CodeMirror à mão e lidar com
 * scroll, redimensionamento e teclado — tudo isso a fonte de autocomplete já resolve, e de brinde
 * vem a navegação por setas, o `Enter` que aceita e o `Escape` que fecha.
 *
 * **O gatilho é estreito de propósito**: só dispara quando o que vem antes do `/` na linha é
 * espaço em branco. Barra é caractere comum em texto (`http://`, `src/lib`, `e/ou`), e um menu que
 * abre no meio de uma URL é um menu que atrapalha mais do que ajuda.
 */

/** A `/` e o que já foi digitado depois dela, sem espaço e sem uma segunda barra (`a/b`). */
const SLASH_QUERY_RE = /\/[^\s/]*$/;

/**
 * Filtro próprio (`filter: false` no resultado), e não o do CodeMirror: o filtro embutido casa por
 * prefixo/subsequência **com acento**, então "citacao" não acharia "Citação" — e ninguém digita
 * acento no meio de um menu de atalho. Aqui a comparação passa por `foldForSearch`, a mesma função
 * que a busca da lista de notas usa.
 */
export function filterInsertItems(
  items: readonly InsertItem[],
  query: string
): readonly InsertItem[] {
  const needle = foldForSearch(query);
  if (!needle) return items;
  return items.filter((item) => {
    if (foldForSearch(item.label).includes(needle)) return true;
    return item.keywords.some((keyword) => foldForSearch(keyword).includes(needle));
  });
}

/**
 * A fonte de autocomplete. `items` é uma função pela mesma razão que os títulos do `[[` são: o
 * editor é montado uma vez e o catálogo depende de quando o menu abriu (o item "Data de hoje").
 */
export function slashMenuSource(
  items: () => readonly InsertItem[] = createInsertItems
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(SLASH_QUERY_RE);
    if (!before) return null;

    // O que vem antes da `/` na linha precisa ser só espaço — é o que separa "começo de linha" de
    // "no meio de `http://`".
    const line = context.state.doc.lineAt(before.from);
    const prefix = context.state.sliceDoc(line.from, before.from);
    if (prefix.trim() !== "") return null;

    const options = filterInsertItems(items(), before.text.slice(1)).map(
      (item): Completion => ({
        label: item.label,
        detail: item.detail,
        type: "keyword",
        apply: (view, _completion, from, to) => applyInsertItem(view, item, from, to),
      })
    );
    if (options.length === 0) return null;

    return {
      // Depois da `/`: é este trecho que o CodeMirror compara com o `label` para destacar. Apontando
      // para a própria barra, o texto comparado seria "/tit" e nenhum rótulo casaria — o mesmo bug
      // que a 056 documentou com o `[[`.
      from: before.from + 1,
      options,
      // Sem `validFor`: a fonte precisa rodar a cada tecla porque o filtro é nosso (ver acima).
      filter: false,
    };
  };
}

/**
 * A transação que escreve o item no documento, no lugar do `/consulta`.
 *
 * Pura sobre `EditorState` (o wrapper de view está logo abaixo), pelo mesmo motivo de
 * `markdownCommands.ts`: é o que permite afirmar em teste **onde o cursor parou** — dentro do
 * fence, dentro da célula da tabela — sem navegador.
 *
 * `from` aponta para depois da barra (é de lá que o resultado do autocomplete começa), então a
 * barra é recuperada olhando o caractere anterior — assim o texto digitado some junto e não sobra
 * `/` órfão na linha.
 */
export function insertItemEdit(
  state: EditorState,
  item: InsertItem,
  from: number,
  to: number
): TransactionSpec {
  const start = state.sliceDoc(from - 1, from) === "/" ? from - 1 : from;
  const { snippet, cursorOffset } = withBlockSeparation(state, item, start);
  return {
    changes: { from: start, to, insert: snippet },
    selection: { anchor: start + cursorOffset },
    scrollIntoView: true,
    userEvent: "input.complete",
  };
}

export function applyInsertItem(
  view: EditorView,
  item: InsertItem,
  from: number,
  to: number
): void {
  view.dispatch(insertItemEdit(view.state, item, from, to));
  view.focus();
}

/**
 * Linha em branco antes do bloco quando há texto na linha de cima.
 *
 * Não é capricho de formatação: `---` logo abaixo de um parágrafo vira **título** (setext) no
 * CommonMark, e a tabela do GFM não interrompe parágrafo — sem a linha em branco, o item inserido
 * renderiza como outra coisa, ou não renderiza.
 */
function withBlockSeparation(
  state: EditorState,
  item: InsertItem,
  start: number
): { snippet: string; cursorOffset: number } {
  if (!item.block) return { snippet: item.snippet, cursorOffset: item.cursorOffset };
  const line = state.doc.lineAt(start);
  if (line.number === 1) return { snippet: item.snippet, cursorOffset: item.cursorOffset };
  const previous = state.doc.line(line.number - 1);
  if (previous.text.trim() === "") {
    return { snippet: item.snippet, cursorOffset: item.cursorOffset };
  }
  return {
    snippet: `\n${item.snippet}`,
    cursorOffset: item.cursorOffset + 1,
  };
}

/**
 * Abre o menu sem digitar `/` — é o que o botão "Inserir" da barra faz.
 *
 * Se o cursor estiver no meio de uma linha com texto, a barra entra numa linha nova: o gatilho só
 * vale em linha em branco, e um botão que não abre o menu seria pior do que botão nenhum.
 */
export function openInsertMenuEdit(state: EditorState): TransactionSpec {
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const prefix = state.sliceDoc(line.from, range.from);
  const insert = prefix.trim() === "" ? "/" : "\n/";
  return {
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + insert.length },
    scrollIntoView: true,
    userEvent: "input",
  };
}

export function openInsertMenu(view: EditorView): boolean {
  view.dispatch(openInsertMenuEdit(view.state));
  view.focus();
  startCompletion(view);
  return true;
}

/** A extensão pronta para o `MarkdownCodeEditor`, pendurada na linguagem markdown (como o `[[`). */
export function slashMenuAutocomplete(
  items?: () => readonly InsertItem[]
): Extension {
  return markdownSupport.language.data.of({
    autocomplete: slashMenuSource(items),
  });
}
