import { syntaxTree } from "@codemirror/language";
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type { EditorState, Extension, Range } from "@codemirror/state";

/**
 * *Live preview* estilo Obsidian: o texto **é** o markdown cru, mas aparece formatado — e a
 * marcação (`**`, `_`, `#`) some, reaparecendo só na linha onde está o cursor, para poder editá-la.
 *
 * Tudo aqui é `Decoration` — camada de **view**. O documento nunca é alterado: `Decoration.mark`
 * só acrescenta classe CSS a um trecho e `Decoration.replace` só esconde da tela. Salvar, recarregar
 * e reabrir devolve os `**` no texto, porque eles nunca saíram de lá. É o que sustenta a decisão de
 * "MARKDOWN NA VEIA" da feature 056.
 */

/** Nó da árvore do markdown → classe aplicada ao trecho inteiro (o conteúdo formatado). */
const CONTENT_CLASS: Record<string, string> = {
  ATXHeading1: "cm-md-h1",
  ATXHeading2: "cm-md-h2",
  ATXHeading3: "cm-md-h3",
  ATXHeading4: "cm-md-h4",
  ATXHeading5: "cm-md-h5",
  ATXHeading6: "cm-md-h6",
  StrongEmphasis: "cm-md-strong",
  Emphasis: "cm-md-em",
  Strikethrough: "cm-md-strike",
  InlineCode: "cm-md-code",
};

/**
 * Nós que são só marcação — o que o live preview esconde fora da linha do cursor.
 * `HeaderMark` entra condicionado ao pai ser um `ATXHeading` (ver abaixo): no heading estilo Setext
 * o "mark" é a linha inteira de `===`, e escondê-la deixaria uma linha fantasma.
 */
const MARK_NODES = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
]);

const hiddenMark = Decoration.replace({});

/** Números (1-based) das linhas tocadas por alguma seleção — nelas a marcação continua visível. */
export function activeLineNumbers(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n += 1) lines.add(n);
  }
  return lines;
}

/**
 * Monta as decorações do documento inteiro. Função pura de `EditorState` — sem `EditorView`, sem
 * DOM — justamente para poder ser testada de verdade em Vitest, em vez de só "renderiza sem
 * quebrar".
 *
 * `activeLines` é injetável para o teste conseguir fixar onde está o cursor sem montar um editor.
 */
export function buildLivePreviewDecorations(
  state: EditorState,
  activeLines: Set<number> = activeLineNumbers(state)
): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    from: 0,
    to: state.doc.length,
    enter: (node) => {
      const contentClass = CONTENT_CLASS[node.name];
      if (contentClass && node.to > node.from) {
        decorations.push(
          Decoration.mark({ class: contentClass }).range(node.from, node.to)
        );
        return;
      }

      if (!MARK_NODES.has(node.name)) return;
      const parent = node.node.parent?.name ?? "";
      if (node.name === "HeaderMark" && !parent.startsWith("ATXHeading")) return;
      // `CodeMark` é tanto a crase do código inline quanto a cerca ``` do bloco. Só a primeira
      // some: esconder a cerca apagaria o limite visual do bloco, que é informação, não marcação.
      if (node.name === "CodeMark" && parent !== "InlineCode") return;
      if (activeLines.has(state.doc.lineAt(node.from).number)) return;

      // No heading o espaço depois do `#` também é marcação: escondendo só o `#`, o título ficaria
      // deslocado por um espaço solto.
      let to = node.to;
      if (node.name === "HeaderMark" && state.sliceDoc(to, to + 1) === " ") {
        to += 1;
      }
      decorations.push(hiddenMark.range(node.from, to));
    },
  });

  // `true` = ordenar: as marcas de um mesmo trecho não saem da árvore em ordem de posição.
  return Decoration.set(decorations, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreviewDecorations(view.state);
    }

    update(update: ViewUpdate) {
      // A seleção entra na conta porque é ela que decide qual linha volta a mostrar a marcação.
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLivePreviewDecorations(update.state);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

/** Aparência do texto formatado. Cores vêm das variáveis de `src/index.css` (segue o dark mode). */
const livePreviewTheme = EditorView.baseTheme({
  ".cm-md-h1": { fontSize: "1.5em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-md-h2": { fontSize: "1.3em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-md-h3": { fontSize: "1.15em", fontWeight: "600" },
  ".cm-md-h4, .cm-md-h5, .cm-md-h6": { fontWeight: "600" },
  ".cm-md-strong": { fontWeight: "700" },
  ".cm-md-em": { fontStyle: "italic" },
  ".cm-md-strike": { textDecoration: "line-through", opacity: "0.7" },
  ".cm-md-code": {
    backgroundColor: "hsl(var(--muted))",
    borderRadius: "3px",
    padding: "0 3px",
  },
});

export const markdownLivePreview: Extension = [livePreviewPlugin, livePreviewTheme];
