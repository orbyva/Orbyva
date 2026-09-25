import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { Command, KeyBinding } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import {
  insertLink,
  toggleHeading,
  toggleList,
  toggleQuote,
  toggleWrap,
} from "@/domain/notes/markdownCommands";
import type {
  HeadingLevel,
  ListKind,
  TextEdit,
  TextSelection,
  WrapMarker,
} from "@/domain/notes/markdownCommands";

/**
 * # Atalhos de formatação do editor de notas (feature 070)
 *
 * Casca fina sobre as funções puras de `domain/notes/markdownCommands`: o comando lê documento e
 * seleção do `EditorState`, chama a função pura e despacha a diferença. Toda a regra ("aplicar de
 * novo remove", "título troca de nível") mora lá, testada sem editor.
 *
 * Os atalhos são os do mercado, sem invenção: `Mod+B` negrito, `Mod+I` itálico, `Mod+K` link,
 * `Mod+Shift+K` código, `Mod+1..6` título, `Mod+Shift+8` lista, `Mod+Shift+7` lista numerada.
 * (`Mod` = `Cmd` no macOS, `Ctrl` no resto.)
 */

/**
 * O menor trecho que muda entre dois textos — prefixo e sufixo iguais ficam de fora.
 *
 * Trocar o documento inteiro a cada atalho funcionaria, mas jogaria fora a granularidade do
 * histórico (um `Ctrl+Z` desfaria a nota toda) e marcaria cada caractere como alterado para quem
 * escuta mudanças. Com o recorte mínimo, `**` em volta de uma palavra é o que entra na transação.
 */
export function minimalChange(
  before: string,
  after: string
): { from: number; to: number; insert: string } | null {
  if (before === after) return null;
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before[start] === after[start]) start += 1;
  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before[endBefore - 1] === after[endAfter - 1]
  ) {
    endBefore -= 1;
    endAfter -= 1;
  }
  return { from: start, to: endBefore, insert: after.slice(start, endAfter) };
}

/**
 * Roda uma transformação pura sobre o documento do editor e reposiciona a seleção onde ela mandar.
 *
 * Devolve sempre `true` (atalho consumido) mesmo quando o texto não muda: se o `Mod+B` deixasse o
 * evento passar, o navegador aplicaria o negrito dele no `contenteditable` — que é justamente o
 * WYSIWYG que este editor não faz.
 */
export function applyMarkdownEdit(
  view: EditorView,
  transform: (doc: string, selection: TextSelection) => TextEdit
): boolean {
  const doc = view.state.doc.toString();
  const { from, to } = view.state.selection.main;
  const edit = transform(doc, { from, to });
  const change = minimalChange(doc, edit.text);

  view.dispatch({
    ...(change ? { changes: change } : {}),
    selection: { anchor: edit.selection.from, head: edit.selection.to },
    scrollIntoView: true,
    userEvent: "input.format",
  });
  return true;
}

function wrapCommand(marker: WrapMarker): Command {
  return (view) => applyMarkdownEdit(view, (doc, sel) => toggleWrap(doc, sel, marker));
}

function listCommand(kind: ListKind): Command {
  return (view) => applyMarkdownEdit(view, (doc, sel) => toggleList(doc, sel, kind));
}

/** Título do nível pedido — o mesmo comando serve `Mod+1` … `Mod+6` e o botão da barra. */
export function headingCommand(level: HeadingLevel): Command {
  return (view) => applyMarkdownEdit(view, (doc, sel) => toggleHeading(doc, sel, level));
}

export const toggleBold = wrapCommand("**");
export const toggleItalic = wrapCommand("_");
export const toggleInlineCode = wrapCommand("`");
export const toggleStrikethrough = wrapCommand("~~");
export const toggleBulletList = listCommand("bullet");
export const toggleOrderedList = listCommand("ordered");
export const toggleTaskList = listCommand("task");
export const toggleBlockquote: Command = (view) =>
  applyMarkdownEdit(view, (doc, sel) => toggleQuote(doc, sel));
export const insertMarkdownLink: Command = (view) =>
  applyMarkdownEdit(view, (doc, sel) => insertLink(doc, sel));

/**
 * Esqueleto de tabela GFM. Constante exportada porque o menu `/` insere exatamente o mesmo texto —
 * dois esqueletos diferentes para a mesma coisa seria inconsistência visível na nota.
 */
export const TABLE_SNIPPET = [
  "| Coluna | Coluna |",
  "| --- | --- |",
  "|  |  |",
].join("\n");

/**
 * Tabela em bloco próprio: entra sempre no começo de uma linha e com linha em branco antes, senão o
 * GFM não reconhece o cabeçalho (tabela grudada num parágrafo vira texto com barras).
 */
export const insertTable: Command = (view) =>
  applyMarkdownEdit(view, (doc, sel) => {
    const from = Math.min(sel.from, sel.to);
    const to = Math.max(sel.from, sel.to);
    const lineStart = doc.lastIndexOf("\n", from - 1) + 1;
    const atLineStart = from === lineStart;
    const emptyLine = atLineStart && doc.slice(lineStart, to).trim() === "";
    const prefix = emptyLine ? "" : atLineStart ? "\n" : "\n\n";
    const text = `${doc.slice(0, from)}${prefix}${TABLE_SNIPPET}\n${doc.slice(to)}`;
    // Cursor na primeira célula do cabeçalho, que é o que o usuário troca primeiro.
    const cursor = from + prefix.length + "| ".length;
    return { text, selection: { from: cursor, to: cursor + "Coluna".length } };
  });

const bindings: readonly KeyBinding[] = [
  { key: "Mod-b", run: toggleBold },
  { key: "Mod-i", run: toggleItalic },
  { key: "Mod-k", run: insertMarkdownLink },
  { key: "Mod-Shift-k", run: toggleInlineCode },
  /**
   * O **mesmo** atalho, escrito com o nome da tecla em maiúscula. Com Shift pressionado o navegador
   * manda `event.key === "K"`, e o CodeMirror só chega em `"k"` traduzindo o `keyCode` — que nem
   * todo ambiente preenche (o jsdom dos testes, por exemplo). Sem este par, `Ctrl+Shift+K` seria um
   * atalho que funciona no navegador e nunca no teste, ou o contrário.
   */
  { key: "Mod-Shift-K", run: toggleInlineCode },
  { key: "Mod-Shift-8", run: toggleBulletList },
  { key: "Mod-Shift-7", run: toggleOrderedList },
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    key: `Mod-${level}`,
    run: headingCommand(level),
  })),
];

/**
 * Teclas que o editor consome e que **também** são atalho global do app — hoje só `Mod+K`, que
 * abre a busca global (`GlobalSearch` escuta no `window`). O `preventDefault` do CodeMirror não
 * impede o evento de subir, então sem isto `Ctrl+K` dentro da nota inseria o link **e** abria a
 * paleta de busca por cima.
 *
 * O handler não consome o evento (devolve `false`): quem formata continua sendo o keymap abaixo.
 */
const APP_SHORTCUT_KEYS = new Set(["b", "i", "k", "1", "2", "3", "4", "5", "6", "7", "8"]);

const stopAppShortcuts = Prec.highest(
  EditorView.domEventHandlers({
    keydown(event) {
      if (!event.metaKey && !event.ctrlKey) return false;
      const key = event.key.toLowerCase();
      // Em teclado americano, `Shift+7` chega como `&`; o dígito só aparece no `code`.
      const code = (event.code ?? "").replace(/^(Key|Digit)/, "").toLowerCase();
      if (!APP_SHORTCUT_KEYS.has(key) && !APP_SHORTCUT_KEYS.has(code)) return false;
      event.stopPropagation();
      return false;
    },
  })
);

/**
 * `Prec.high` para ganhar do keymap padrão do CodeMirror (que reivindica `Mod-i` em algumas
 * plataformas), mas **abaixo** do `literalTabKeymap`, que é `Prec.highest` e não disputa nenhuma
 * destas teclas.
 */
export const markdownFormattingKeymap: Extension = [
  stopAppShortcuts,
  Prec.high(keymap.of(bindings)),
];
