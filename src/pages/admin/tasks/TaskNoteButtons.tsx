import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, NotebookPen, PenTool, Plus } from "lucide-react";
import { ActionTooltip } from "@/components/ActionTooltip";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createNote } from "@/api/notes/notes";
import { addNoteLink, fetchNotesLinkedTo } from "@/api/notes/noteLinks";
import { buildTaskNoteDraft, buildTaskNoteLinkDraft } from "@/domain/tasks/taskNoteDraft";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/currency";
import { getErrorMessage } from "@/lib/errors";
import type { Note, NoteKind } from "@/types/notes";
import type { Task } from "@/types/tasks";

/**
 * Atalho "desta tarefa, criar uma nota / um canvas" (feature 084) — o caminho **de ida** que
 * faltava: até aqui só dava para partir da nota e procurar a tarefa no `NoteLinksPanel`.
 *
 * Dois botões **só-ícone** em vez de um botão com menu: são duas opções, e a 058 já rejeitou
 * esconder o canvas atrás de um clique a mais (ele fica invisível para quem não sabe que existe).
 * Ficam na fileira de instrumentos do painel denso (`TaskFormFields`, feature 080), que é
 * exatamente a linha onde botão sem rótulo cabe sem custo de altura.
 *
 * Traz o próprio `TooltipProvider` pelo mesmo motivo de `TaskStartNowButton`: o componente pode ser
 * montado fora do formulário (teste, ou outra superfície depois), e aninhar providers é inofensivo.
 */

/** O que muda de um botão para o outro. O resto — tamanho, estados, rede — é idêntico. */
const KIND_UI: Record<
  NoteKind,
  {
    icon: typeof NotebookPen;
    /** Rótulo de quando não há nenhuma: o clique cria direto. */
    createLabel: string;
    /** Rótulo de quando já há alguma: o clique abre a lista. A contagem entra depois dele. */
    listLabel: string;
    /** O item do fim do popover, que cria mais uma (a relação é 1-para-N). */
    createAnotherLabel: string;
  }
> = {
  markdown: {
    icon: NotebookPen,
    createLabel: "Criar nota desta tarefa",
    listLabel: "Notas desta tarefa",
    createAnotherLabel: "Criar outra nota",
  },
  canvas: {
    icon: PenTool,
    createLabel: "Criar canvas desta tarefa",
    listLabel: "Canvas desta tarefa",
    createAnotherLabel: "Criar outro canvas",
  },
};

/** Dica do modo criação: sem tarefa salva não há `entity_id` para o `note_link` apontar. */
export const TASK_NOTE_UNSAVED_HINT = "Salve a tarefa antes";

/**
 * As notas da tarefa separadas por `kind` — o vínculo `note_link` não distingue nota de canvas
 * (quem distingue é `note.kind`), e cada botão só enxerga o seu lado.
 * Qualquer coisa que não seja `canvas` conta como markdown, que é o default da coluna.
 */
function splitByKind(notes: readonly Note[]): Record<NoteKind, Note[]> {
  return {
    canvas: notes.filter((note) => note.kind === "canvas"),
    markdown: notes.filter((note) => note.kind !== "canvas"),
  };
}

export interface TaskNoteButtonsProps {
  /**
   * A tarefa dona das notas — `null` em modo criação (formulário de tarefa nova). Nesse caso os
   * dois botões ficam desabilitados: o vínculo precisa do id, e salvar a tarefa por efeito
   * colateral de um botão que fala de outra coisa seria surpresa (o título pode nem estar
   * preenchido).
   */
  task: Task | null;
}

export function TaskNoteButtons({ task }: TaskNoteButtonsProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  /** Qual dos dois está ocupado agora — `null` quando nenhum. */
  const [pendingKind, setPendingKind] = useState<NoteKind | null>(null);
  /** Qual dos dois abriu o popover "já existe" — `null` quando nenhum. */
  const [openKind, setOpenKind] = useState<NoteKind | null>(null);
  /** Notas já vinculadas à tarefa. `null` = ainda carregando, `[]` = carregou e não há nenhuma. */
  const [linked, setLinked] = useState<Note[] | null>(null);
  /**
   * A consulta em voo. Um clique dado antes de ela voltar **espera por ela** em vez de decidir com
   * a lista vazia — senão o atalho criaria uma segunda nota justamente na abertura do formulário,
   * que é quando o usuário mais clica.
   */
  const linkedPromise = useRef<Promise<Note[]> | null>(null);
  const taskId = task?.id ?? null;

  useEffect(() => {
    if (!taskId) {
      linkedPromise.current = null;
      setLinked(null);
      return;
    }
    let alive = true;
    // Uma consulta por **abertura do formulário**, não uma por botão: os dois `kind` saem da
    // mesma lista (`note_link` não distingue nota de canvas — quem distingue é `note.kind`).
    // Falha aqui não trava o atalho: cai em lista vazia e o botão volta a criar direto, que é
    // menos ruim que um botão inerte sem explicação.
    const pending = fetchNotesLinkedTo("task", taskId).catch(() => [] as Note[]);
    linkedPromise.current = pending;
    setLinked(null);
    pending.then((notes) => {
      if (alive) setLinked(notes);
    });
    return () => {
      alive = false;
    };
  }, [taskId]);

  const byKind = useMemo(() => splitByKind(linked ?? []), [linked]);

  /**
   * O clique: **zero** notas daquele `kind` → cria e abre; **uma ou mais** → popover com as que já
   * existem. Cada botão conta só o seu `kind`, senão criar um canvas esconderia o atalho de nota
   * atrás de um clique a mais.
   */
  async function handleClick(kind: NoteKind) {
    if (!task || pendingKind) return;
    setPendingKind(kind);
    const notes = linked ?? (await (linkedPromise.current ?? Promise.resolve<Note[]>([])));
    if (splitByKind(notes)[kind].length > 0) {
      setPendingKind(null);
      setOpenKind(kind);
      return;
    }
    await createAndOpen(kind);
  }

  /** "Criar outra nota"/"Criar outro canvas", do fim do popover: a lista já é conhecida, então
   * não passa pela decisão do `handleClick` — vai direto criar. */
  async function createAnother(kind: NoteKind) {
    if (!task || pendingKind) return;
    setPendingKind(kind);
    await createAndOpen(kind);
  }

  /**
   * Cria a nota (ou o canvas), grava o vínculo com a tarefa e abre o editor — o "um clique" do
   * pedido. As duas gravações são chamadas separadas de propósito: `note` e `note_link` são tabelas
   * diferentes, e não há transação do lado do cliente.
   */
  async function createAndOpen(kind: NoteKind) {
    if (!task) return;
    let note: Note;
    try {
      note = await createNote(buildTaskNoteDraft(task, kind));
    } catch (error) {
      // Não nasceu nada: fica no formulário, com o erro na tela.
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(
          error,
          kind === "canvas"
            ? "Não foi possível criar o canvas."
            : "Não foi possível criar a nota."
        ),
      });
      setPendingKind(null);
      return;
    }

    try {
      await addNoteLink(buildTaskNoteLinkDraft(note.id, task));
      setLinked((prev) => [note, ...(prev ?? [])]);
    } catch {
      // A nota já existe. Apagá-la seria jogar fora o que o usuário mandou criar por causa de
      // uma linha de vínculo — pior que um vínculo faltando, que o `NoteLinksPanel` do editor
      // permite refazer à mão. Por isso avisa e segue.
      toast({
        variant: "destructive",
        title: "Vínculo não gravado",
        description:
          kind === "canvas"
            ? "O canvas foi criado, mas não ficou vinculado à tarefa. Refaça o vínculo no painel de vínculos."
            : "A nota foi criada, mas não ficou vinculada à tarefa. Refaça o vínculo no painel de vínculos.",
      });
    }

    setPendingKind(null);
    setOpenKind(null);
    navigate(`/notes/${note.id}`);
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <TaskNoteButton
            kind="markdown"
            task={task}
            notes={byKind.markdown}
            open={openKind === "markdown"}
            pending={pendingKind === "markdown"}
            // Criar duas notas de uma vez por dois cliques rápidos seria surpresa: enquanto uma
            // criação está no ar, os dois botões ficam fora do ar.
            busy={pendingKind !== null}
            onClick={() => handleClick("markdown")}
            onOpenChange={(next) => setOpenKind(next ? "markdown" : null)}
            onCreateAnother={() => createAnother("markdown")}
          />
          <TaskNoteButton
            kind="canvas"
            task={task}
            notes={byKind.canvas}
            open={openKind === "canvas"}
            pending={pendingKind === "canvas"}
            busy={pendingKind !== null}
            onClick={() => handleClick("canvas")}
            onOpenChange={(next) => setOpenKind(next ? "canvas" : null)}
            onCreateAnother={() => createAnother("canvas")}
          />
        </div>
        {!task && (
          <p className="text-[10px] text-muted-foreground">{TASK_NOTE_UNSAVED_HINT}</p>
        )}
      </div>
    </TooltipProvider>
  );
}

function TaskNoteButton({
  kind,
  task,
  notes,
  open,
  pending,
  busy,
  onClick,
  onOpenChange,
  onCreateAnother,
}: {
  kind: NoteKind;
  task: Task | null;
  /** As notas deste `kind` já vinculadas à tarefa — vazio enquanto a consulta não volta. */
  notes: readonly Note[];
  /** O popover "já existe" deste botão está aberto. */
  open: boolean;
  /** Este botão é o que está ocupado: mostra o spinner no lugar do ícone. */
  pending: boolean;
  /** Alguma criação está no ar (deste botão ou do irmão). */
  busy: boolean;
  onClick: () => void;
  onOpenChange: (open: boolean) => void;
  onCreateAnother: () => void;
}) {
  const { icon: Icon, createLabel, listLabel, createAnotherLabel } = KIND_UI[kind];
  const hasNotes = notes.length > 0;
  // Com vínculo existente o botão deixa de ser "criar" e passa a ser "as que já existem (2)" — o
  // leitor de tela precisa saber disso **antes** de clicar, não depois.
  const label = hasNotes ? `${listLabel} — ${notes.length}` : createLabel;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <ActionTooltip label={label}>
        {/* Âncora, não `PopoverTrigger`: quem decide entre criar e abrir é o `onClick`, e um
            trigger abriria o popover mesmo quando o certo é criar direto. */}
        <PopoverAnchor asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!task || busy}
            aria-label={label}
            aria-haspopup={hasNotes ? "dialog" : undefined}
            aria-expanded={hasNotes ? open : undefined}
            onClick={onClick}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
        </PopoverAnchor>
      </ActionTooltip>
      <PopoverContent className="w-64 space-y-1 p-2" align="start" aria-label={listLabel}>
        <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {listLabel}
        </p>
        <ul className="space-y-0.5">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                to={`/notes/${note.id}`}
                onClick={() => onOpenChange(false)}
                className="block rounded-sm px-1 py-1 hover:bg-muted"
              >
                <span className="block truncate text-xs">{note.title}</span>
                {note.updated_at && (
                  <span className="block text-[10px] text-muted-foreground">
                    Editada em {formatDateBR(note.updated_at)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
        {/* A relação é 1-para-N: uma tarefa pode ter pauta, rascunho e diagrama. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-full justify-start gap-1.5 text-xs"
          onClick={onCreateAnother}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          {createAnotherLabel}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
