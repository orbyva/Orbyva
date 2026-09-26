import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListTodo,
  Table,
  Plus,
  Workflow,
} from "lucide-react";
import type { Command, EditorView } from "@codemirror/view";
import { Button } from "@/components/ui/button";
import {
  headingCommand,
  insertMarkdownLink,
  insertTable,
  toggleBold,
  toggleBulletList,
  toggleInlineCode,
  toggleItalic,
  toggleTaskList,
} from "@/components/codemirror/formattingKeymap";
import { cn } from "@/lib/utils";

/**
 * # Barra de ferramentas do editor de nota (feature 070)
 *
 * Pequena e **sempre visível**, não flutuante sobre a seleção: toolbar flutuante exigiria medir a
 * seleção e brigaria com o live preview, e o ganho não paga (ver Decisões da 070).
 *
 * Cada botão roda exatamente o **mesmo comando** do atalho de teclado — não há uma segunda
 * implementação de "negrito" aqui. O `title` de cada botão mostra o atalho correspondente, que é
 * como o usuário descobre que existe atalho.
 */

/** `Cmd` no Apple, `Ctrl` no resto — o rótulo do atalho precisa bater com o teclado de quem lê. */
function modLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl+";
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘" : "Ctrl+";
}

interface ToolbarAction {
  label: string;
  shortcut: string;
  icon: typeof Bold;
  command: Command;
}

function actions(mod: string): ToolbarAction[] {
  return [
    { label: "Negrito", shortcut: `${mod}B`, icon: Bold, command: toggleBold },
    { label: "Itálico", shortcut: `${mod}I`, icon: Italic, command: toggleItalic },
    /**
     * "Título de seção", e não só "Título": a nota tem um campo **Título** logo acima, e dois
     * controles com o mesmo nome acessível na mesma tela é ambiguidade para leitor de tela (e foi
     * ambiguidade real para os testes, que passaram a achar dois elementos).
     */
    {
      label: "Título de seção",
      shortcut: `${mod}2`,
      icon: Heading2,
      command: headingCommand(2),
    },
    { label: "Link", shortcut: `${mod}K`, icon: LinkIcon, command: insertMarkdownLink },
    { label: "Lista", shortcut: `${mod}⇧8`, icon: List, command: toggleBulletList },
    { label: "Tarefa", shortcut: "", icon: ListTodo, command: toggleTaskList },
    { label: "Código", shortcut: `${mod}⇧K`, icon: Code, command: toggleInlineCode },
    { label: "Tabela", shortcut: "", icon: Table, command: insertTable },
  ];
}

export function NoteEditorToolbar({
  run,
  getView,
  onInsert,
  onInsertDiagram,
  className,
}: {
  /** Roda o comando no editor real (e devolve o foco para lá). */
  run?: (command: Command) => void;
  /**
   * Alternativa a `run` (consumidores da barra antiga / descrição de tarefa): a barra pergunta a
   * view na hora do clique.
   */
  getView?: () => EditorView | null;
  /** Abre o menu de inserção (`/`) — botão "Inserir" da barra antiga. */
  onInsert?: () => void;
  /** O botão de diagrama mermaid. */
  onInsertDiagram?: () => void;
  className?: string;
}) {
  const mod = modLabel();
  const execute = (command: Command) => {
    if (run) {
      run(command);
      return;
    }
    const view = getView?.();
    if (!view) return;
    command(view);
    view.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label="Formatação"
      className={cn("flex flex-wrap items-center gap-0.5", className)}
    >
      {actions(mod).map(({ label, shortcut, icon: Icon, command }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={label}
          title={shortcut ? `${label} (${shortcut})` : label}
          /**
           * O clique não pode roubar o foco do editor **antes** de o comando rodar: sem isto o
           * navegador tira a seleção visível do `contenteditable` e o usuário vê o cursor sumir a
           * cada botão. O estado do CodeMirror guarda a seleção de qualquer jeito, mas o piscar é
           * feio e o `view.focus()` de volta ficaria brigando com o browser.
           */
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => execute(command)}
        >
          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        </Button>
      ))}
      {/* Descoberta da funcionalidade: ninguém digita sintaxe de mermaid de cabeça (feature 057). */}
      {onInsert ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onInsert}
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Inserir
        </Button>
      ) : null}
      {onInsertDiagram ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onInsertDiagram}
        >
          <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
          Inserir diagrama
        </Button>
      ) : null}
    </div>
  );
}
