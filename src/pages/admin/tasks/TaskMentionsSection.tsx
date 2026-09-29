import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CornerUpLeft, ListTodo, NotebookPen } from "lucide-react";
import { fetchNotesMentioningTask } from "@/api/notes/notes";
import { fetchTasksMentioningTask } from "@/api/tasks";
import { mentionsTaskId } from "@/domain/tasks/taskRefs";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

/**
 * "Referenciada em" (feature 106): o outro lado da marca `[Rótulo](orbyva-task:<id>)`. A 105 fez o
 * texto mostrar o estado da tarefa; aqui a **tarefa** mostra onde foi citada — sem isso o vínculo
 * é de mão única.
 *
 * Duas fontes, que são exatamente os dois campos onde a marca vale: `note.content` e
 * `task.description`. Elas saem em **listas separadas e rotuladas** porque misturá-las obrigaria o
 * leitor a adivinhar de onde cada linha veio.
 *
 * Sem tabela de índice: o backlink é **derivado do texto**, como a 056 decidiu para nota. E, como
 * lá, o `ilike` da consulta é só **prefiltro** — quem decide o que é menção de verdade é
 * `mentionsTaskId` (103), que descarta a marca escrita dentro de bloco de código. Sem essa
 * confirmação, uma nota que só mostra a sintaxe num exemplo entraria como menção real.
 *
 * A vantagem estrutural sobre o `BacklinksPanel` das notas: a marca guarda **id**, não título.
 * Renomear a tarefa não derruba menção nenhuma, e o prefiltro `%orbyva-task:<uuid>%` é
 * praticamente exato.
 */

interface MentionRow {
  id: string;
  title: string;
  to: string;
}

export interface TaskMentionsSectionProps {
  /** Só tarefa que já existe tem id — em "Nova tarefa" não há o que procurar. */
  taskId: string;
}

export function TaskMentionsSection({ taskId }: TaskMentionsSectionProps) {
  const [notes, setNotes] = useState<MentionRow[]>([]);
  const [tasks, setTasks] = useState<MentionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    void (async () => {
      try {
        // Em paralelo: são duas tabelas independentes, e encadeá-las dobraria a espera de abrir o
        // formulário sem motivo nenhum.
        const [notasCandidatas, tarefasCandidatas] = await Promise.all([
          fetchNotesMentioningTask(taskId),
          fetchTasksMentioningTask(taskId),
        ]);
        if (cancelado) return;
        setNotes(
          notasCandidatas
            .filter((note) => mentionsTaskId(note.content ?? "", taskId))
            .map((note) => ({
              id: note.id,
              title: note.title,
              to: `/notes/${note.id}`,
            }))
        );
        setTasks(
          tarefasCandidatas
            .filter((task) => mentionsTaskId(task.description ?? "", taskId))
            .map((task) => ({
              id: task.id,
              title: task.title,
              // Destino da 102 — o Dialog de edição troca para ela. Nada de abrir Dialog por cima
              // de Dialog.
              to: `/tasks?task=${task.id}`,
            }))
        );
      } catch (error) {
        if (cancelado) return;
        setNotes([]);
        setTasks([]);
        toast({
          variant: "destructive",
          title: "Erro ao carregar as menções",
          description: getErrorMessage(error),
        });
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [taskId, toast]);

  /**
   * Enquanto carrega não renderiza nada — e, sem menção nenhuma, também não. Um título
   * "Referenciada em" que aparece e some (ou fica vazio) em toda tarefa é exatamente o espaço
   * morto que a decisão do arquivo proíbe; o formulário de tarefa já é comprido.
   */
  if (loading) return null;
  if (notes.length === 0 && tasks.length === 0) return null;

  return (
    <section aria-labelledby="task-mentions-heading" className="border-t pt-2">
      <p
        id="task-mentions-heading"
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        <CornerUpLeft className="h-3 w-3" aria-hidden="true" />
        Referenciada em
      </p>
      <div className="mt-1.5 space-y-2">
        <MentionList caption="Notas" icon={NotebookPen} rows={notes} />
        <MentionList caption="Tarefas" icon={ListTodo} rows={tasks} />
      </div>
    </section>
  );
}

function MentionList({
  caption,
  icon: Icon,
  rows,
}: {
  caption: string;
  icon: typeof NotebookPen;
  rows: MentionRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {caption}
      </p>
      <ul className="mt-0.5 space-y-0.5">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              to={row.to}
              className="block truncate text-xs text-primary hover:underline"
            >
              {row.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
