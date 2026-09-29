import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { parseTaskRefs, taskRefAt } from "@/domain/tasks/taskRefs";
import type { TaskRefMatch } from "@/domain/tasks/taskRefs";

/**
 * Referência de tarefa clicável no editor (feature 104): `[Rótulo](orbyva-task:<id>)` fica colorido
 * e o clique abre a tarefa em `/tasks?task=<id>` (destino da 102).
 *
 * Irmã de `wikiLinkNavigation` (056), e pelos mesmos dois motivos que aquela documenta:
 *
 * - **decoração, não chip.** No editor o texto é o Markdown cru; o chip com status e prazo é da
 *   105, no render fora do editor. Mesma divisão que o `[[…]]` já tem.
 * - **`pointerdown`, não `click`.** O formulário da tarefa vive num Dialog do Radix, cujo trap de
 *   foco engole o `click` (razão registrada em `wikiLinkNavigation.ts:45-47`).
 *
 * Quem decide o que é referência é o parser da 103 — então marca dentro de bloco de código ou de
 * código inline não é decorada nem clicável, de graça.
 */

/**
 * As decorações do documento — função pura, testável sem geometria de layout (mesmo caminho que
 * `livePreview.ts` usa para poder afirmar o que ficou marcado).
 */
export function taskRefDecorations(doc: string): DecorationSet {
  const ranges = parseTaskRefs(doc).map((match) =>
    Decoration.mark({ class: "cm-task-ref" }).range(match.start, match.end)
  );
  return Decoration.set(ranges, true);
}

/**
 * O que um clique em `pos` deve abrir — `null` quando não há o que abrir.
 *
 * Separada do handler de DOM porque é a regra, e a regra precisa de assertiva: o clique em si
 * depende de `posAtCoords`, que sem layout de verdade não devolve posição nenhuma.
 */
export function taskRefClickTarget(
  doc: string,
  pos: number | null,
  event: { button: number; altKey: boolean }
): TaskRefMatch | null {
  // Alt+clique deixa o cursor entrar no trecho para editar o rótulo à mão; botão do meio e
  // direito seguem o caminho normal do navegador.
  if (event.button !== 0 || event.altKey) return null;
  if (pos == null) return null;
  return taskRefAt(doc, pos);
}

export function taskRefNavigation(handlers: {
  onOpen: (id: string, label: string) => void;
}): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = taskRefDecorations(view.state.doc.toString());
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = taskRefDecorations(update.state.doc.toString());
        }
      }
    },
    { decorations: (value) => value.decorations }
  );

  const clicks = EditorView.domEventHandlers({
    pointerdown(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const match = taskRefClickTarget(view.state.doc.toString(), pos, event);
      if (!match) return false;
      event.preventDefault();
      event.stopPropagation();
      handlers.onOpen(match.id, match.label);
      return true;
    },
  });

  const theme = EditorView.baseTheme({
    ".cm-task-ref": {
      color: "hsl(var(--primary))",
      textDecoration: "underline",
      cursor: "pointer",
    },
  });

  return [plugin, clicks, theme];
}
