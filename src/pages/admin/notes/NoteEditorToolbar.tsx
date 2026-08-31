import {
  Bold,
  Code,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  Plus,
  TextQuote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EditorView } from "@codemirror/view";
import { Button } from "@/components/ui/button";
import {
  FORMAT_ACTION_BY_ID,
  shortcutLabel,
} from "@/components/codemirror/formatKeymap";
import type { FormatActionId } from "@/components/codemirror/formatKeymap";

/**
 * # Barra de ferramentas do editor de notas (feature 068)
 *
 * A segunda porta de entrada da formatação: quem não sabe (ou não quer lembrar) que negrito é
 * `**`, clica. Os atalhos e a barra chamam **os mesmos comandos** — o catálogo é o
 * `MARKDOWN_FORMAT_ACTIONS` do `formatKeymap.ts`, então rótulo, tecla e efeito não podem divergir.
 *
 * **Curta de propósito.** Foram descartadas a barra completa com um botão por sintaxe e o menu
 * suspenso por categoria: uma barra que não cabe numa linha em 360px vira duas linhas de barra num
 * editor que já disputa altura com o texto. O que não está aqui está no menu `/` (botão "Inserir"),
 * que é buscável e por isso escala sem ocupar tela.
 *
 * O `title` mostra o atalho ao lado do nome — é assim que a barra se torna dispensável para quem
 * usa a nota todo dia.
 */

/** Quais ações aparecem, nesta ordem. O resto vive no menu de inserção. */
const TOOLBAR_ITEMS: readonly { id: FormatActionId; Icon: LucideIcon }[] = [
  { id: "bold", Icon: Bold },
  { id: "italic", Icon: Italic },
  { id: "code", Icon: Code },
  { id: "link", Icon: LinkIcon },
  { id: "bullet", Icon: List },
  { id: "task", Icon: ListChecks },
  { id: "quote", Icon: TextQuote },
];

/**
 * Rótulo do botão que abre o menu de inserção. Constante local, **não** exportada: exportar de
 * arquivo de componente acende `react-refresh/only-export-components` (a regra do repo é não
 * acrescentar warning novo), e um rótulo de três sílabas não justifica um módulo só para ele.
 */
const INSERT_MENU_BUTTON_LABEL = "Inserir";

export function NoteEditorToolbar({
  getView,
  onInsert,
  className,
}: {
  /**
   * O editor pode ainda não existir (a aba "Visualizar" desmonta o CodeMirror), por isso é uma
   * função e não a view: a barra pergunta na hora do clique, em vez de guardar uma referência que
   * pode ter morrido.
   */
  getView: () => EditorView | null;
  /** Abre o menu de inserção — o mesmo do `/`. */
  onInsert: () => void;
  className?: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Formatação"
      // `flex-wrap` em vez de rolagem horizontal: em 360px a barra quebra para uma segunda linha
      // curta, que é melhor do que esconder botão atrás de scroll sem affordance.
      className={["flex flex-wrap items-center gap-0.5", className]
        .filter(Boolean)
        .join(" ")}
    >
      {TOOLBAR_ITEMS.map(({ id, Icon }) => {
        const action = FORMAT_ACTION_BY_ID[id];
        return (
          <Button
            key={id}
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={action.label}
            title={
              action.key
                ? `${action.label} (${shortcutLabel(action.key)})`
                : action.label
            }
            // `onMouseDown` com `preventDefault` seria o jeito de não perder o foco do editor; aqui
            // não é preciso, porque todo comando devolve o foco (`markdownCommands.apply`).
            onClick={() => {
              const view = getView();
              if (view) action.run(view);
            }}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        );
      })}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 text-xs"
        onClick={onInsert}
      >
        <Plus aria-hidden="true" className="h-3.5 w-3.5" />
        {INSERT_MENU_BUTTON_LABEL}
      </Button>
    </div>
  );
}
