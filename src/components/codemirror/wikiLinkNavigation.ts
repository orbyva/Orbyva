import {
  Decoration,
  EditorView,
  ViewPlugin,
} from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { parseWikiLinks, wikiLinkAt } from "@/domain/notes/wikiLinks";

/**
 * Wiki-link clicável no editor: `[[Título]]` parece um link e o clique abre a nota.
 *
 * Sem isso o `[[]]` só resolvia no preview — quem vincula na descrição da tarefa (ou escreve
 * uma nota) ficava com o texto azul-de-mentira e nenhum destino. Alt+clique deixa o cursor
 * entrar no trecho para editar o título.
 */

function wikiLinkMarks(doc: string): DecorationSet {
  const ranges = parseWikiLinks(doc).map((match) =>
    Decoration.mark({ class: "cm-wiki-link" }).range(match.start, match.end)
  );
  return Decoration.set(ranges, true);
}

export function wikiLinkNavigation(handlers: {
  resolveHref: (title: string) => string | null;
  onOpen: (title: string, href: string | null) => void;
}): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = wikiLinkMarks(view.state.doc.toString());
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = wikiLinkMarks(update.state.doc.toString());
        }
      }
    },
    { decorations: (value) => value.decorations }
  );

  const clicks = EditorView.domEventHandlers({
    // `pointerdown` (não `click`): o form da tarefa vive num Dialog do Radix, e o clique
    // no `<a>`/`click` era engolido pelo trap de foco. Alt+clique deixa o cursor entrar
    // no trecho para editar o título.
    pointerdown(event, view) {
      if (event.button !== 0 || event.altKey) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;
      const match = wikiLinkAt(view.state.doc.toString(), pos);
      if (!match) return false;
      event.preventDefault();
      event.stopPropagation();
      handlers.onOpen(match.title, handlers.resolveHref(match.title));
      return true;
    },
  });

  const theme = EditorView.baseTheme({
    ".cm-wiki-link": {
      color: "hsl(var(--primary))",
      textDecoration: "underline",
      cursor: "pointer",
    },
  });

  return [plugin, clicks, theme];
}
