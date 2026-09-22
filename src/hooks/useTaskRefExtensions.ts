import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Extension } from "@codemirror/state";
import { taskRefAutocomplete } from "@/components/codemirror/taskRefCompletion";
import { taskRefNavigation } from "@/components/codemirror/taskRefNavigation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { Task } from "@/types/tasks";

/**
 * `@/api/tasks/tasks` entra por **import dinâmico**, de propósito.
 *
 * Aquele módulo arrasta a API de recorrência, a de medicação e o domínio de tarefas inteiro — um
 * import estático aqui colaria tudo isso no chunk de Notas, que não precisa de nada disso para
 * abrir. Medido: o grafo de `NoteDetail` saltou de ~850 ms para ~1,5 s de carregamento com o
 * import estático. Carregar só quando o `TASK->` é de fato usado mantém a porta certa
 * (`createTask`, nunca insert direto) sem o peso.
 */
const tasksApi = () => import("@/api/tasks/tasks");

/**
 * O `TASK->` (feature 104) pronto para pendurar num `MarkdownCodeEditor`.
 *
 * Os dois campos do app que montam o editor — descrição de tarefa/subtarefa
 * (`TaskDescriptionField`) e corpo da nota (`NoteEditor`) — precisam exatamente da mesma tripa:
 * carregar as tarefas do usuário, criar pela porta de sempre (`createTask`) herdando o projeto do
 * contexto, avisar por toast quando a gravação falha e navegar para `/tasks?task=<id>` no clique.
 * Duplicar isso nos dois seria duas cópias divergindo na primeira correção.
 *
 * `projectId` é o projeto **do contexto**: o da tarefa que está sendo editada, ou o da nota aberta.
 * Não havendo, `null` — perguntar o projeto num popup de digitação mataria a fluidez (decisão da
 * feature).
 */
export function useTaskRefExtensions(projectId: string | null): Extension[] {
  const [tasks, setTasks] = useState<Task[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  /**
   * Tudo o que muda a cada render entra por ref, não por dependência: o array de extensões é
   * criado **uma vez** — recriá-lo faria o CodeMirror se reconfigurar por tecla digitada e fecharia
   * o popup no meio da escolha (mesma razão já registrada em `MarkdownCodeEditor.tsx`).
   */
  const tasksRef = useRef<readonly Task[]>(tasks);
  tasksRef.current = tasks;
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    let alive = true;
    void tasksApi()
      .then(({ fetchTasks }) => fetchTasks())
      .then((list) => {
        if (alive) setTasks(list);
      })
      // Sem tarefas, o `TASK->` ainda cria — só não sugere. Silencioso de propósito: é um
      // autocomplete, não a tela de tarefas.
      .catch(() => {
        if (alive) setTasks([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * A gravação passa por `createTask`, a mesma porta dos formulários e da Orb — nenhum insert
   * direto em `task`. Falhando, devolve `null`: quem chamou deixa o rótulo como texto simples, e o
   * toast explica. O texto da pessoa nunca some (molde de `handleCreateLinkedNote`).
   */
  const createTaskRef = useCallback(
    async (title: string): Promise<Task | null> => {
      try {
        const { createTask } = await tasksApi();
        const created = await createTask({
          title,
          project_id: projectIdRef.current,
          parent_task_id: null,
          status: "todo",
          tag_ids: [],
          due_date: null,
          recurrence_rule: null,
          linked_recurring_id: null,
        });
        setTasks((prev) => [created, ...prev]);
        return created;
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: getErrorMessage(error, "Não foi possível criar a tarefa."),
        });
        return null;
      }
    },
    [toast]
  );

  const createRef = useRef(createTaskRef);
  createRef.current = createTaskRef;

  return useMemo(
    () => [
      taskRefAutocomplete(() => tasksRef.current, (title) => createRef.current(title)),
      taskRefNavigation({
        // Destino da 102: o id na URL abre o Dialog daquela tarefa. Não há rota `/tasks/:id`.
        onOpen: (id) => navigateRef.current(`/tasks?task=${encodeURIComponent(id)}`),
      }),
    ],
    []
  );
}
