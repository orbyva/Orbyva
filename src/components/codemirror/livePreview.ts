import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type { EditorState, Extension, Range } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

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
  // Feature 068 — o que faltava para o editor parecer o texto que ele vira.
  Blockquote: "cm-md-quote",
  Link: "cm-md-link",
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
  // 068: `>` da citação, `-` da lista, e os `[]()` + URL do link.
  "QuoteMark",
  "ListMark",
  "LinkMark",
  "URL",
]);

/** Marcação cujo espaço seguinte também é marcação: `# ` e `> ` deixariam um espaço solto. */
const EATS_TRAILING_SPACE = new Set(["HeaderMark", "QuoteMark"]);

const hiddenMark = Decoration.replace({});

/**
 * O `-` da lista não é escondido, e sim **trocado por um marcador de verdade** (feature 068):
 * some com o hífen e o item viraria um parágrafo qualquer, perdendo a informação "isto é uma
 * lista". É o mesmo caminho do Obsidian, e vale só para lista não ordenada — em `1.` o número é
 * conteúdo, não marcação.
 */
class BulletWidget extends WidgetType {
  eq(): boolean {
    // Todos os marcadores são iguais: o CodeMirror pode reusar o DOM entre atualizações.
    return true;
  }

  toDOM(): HTMLElement {
    const dot = document.createElement("span");
    dot.className = "cm-md-bullet";
    dot.textContent = "•";
    return dot;
  }
}

const bulletMark = Decoration.replace({ widget: new BulletWidget() });

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
        if (node.name === "Link" && !isResolvedLink(node.node)) return;
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
      /**
       * Só link **com destino** (`[texto](url)`) tem marcação escondida.
       *
       * O parser trata `[[Nota]]` como um `Link` de `[Nota]` sem URL — esconder esses colchetes
       * mostraria `[Nota]` na tela e faria o wiki-link da 056 parecer um link comum quebrado. O
       * `URL` também aparece em autolink (`<http://…>`), onde o endereço **é** o texto visível.
       */
      if (node.name === "LinkMark" || node.name === "URL") {
        const link = node.node.parent;
        if (!link || link.name !== "Link" || !isResolvedLink(link)) return;
      }
      // Só lista não ordenada ganha marcador: em `1.` o número é conteúdo.
      if (
        node.name === "ListMark" &&
        node.node.parent?.parent?.name !== "BulletList"
      ) {
        return;
      }
      if (activeLines.has(state.doc.lineAt(node.from).number)) return;

      // No heading (e na citação) o espaço depois da marca também é marcação: escondendo só o
      // `#`, o título ficaria deslocado por um espaço solto.
      let to = node.to;
      if (
        EATS_TRAILING_SPACE.has(node.name) &&
        state.sliceDoc(to, to + 1) === " "
      ) {
        to += 1;
      }
      decorations.push(
        (node.name === "ListMark" ? bulletMark : hiddenMark).range(node.from, to)
      );
    },
  });

  // `true` = ordenar: as marcas de um mesmo trecho não saem da árvore em ordem de posição.
  return Decoration.set(decorations, true);
}

/** Um `Link` do parser só é link de verdade quando tem destino — ver o comentário acima. */
function isResolvedLink(link: SyntaxNode): boolean {
  for (let child = link.firstChild; child; child = child.nextSibling) {
    if (child.name === "URL") return true;
  }
  return false;
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
  // 068. A citação não pode usar borda à esquerda: a decoração é inline (`Decoration.mark`) e a
  // borda apareceria no meio da linha, não na margem. Cor e itálico dizem a mesma coisa.
  ".cm-md-quote": { color: "hsl(var(--muted-foreground))", fontStyle: "italic" },
  ".cm-md-link": { color: "hsl(var(--primary))", textDecoration: "underline" },
  ".cm-md-bullet": { color: "hsl(var(--muted-foreground))" },
});

export const markdownLivePreview: Extension = [livePreviewPlugin, livePreviewTheme];
