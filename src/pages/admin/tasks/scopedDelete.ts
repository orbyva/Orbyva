import { deleteTaskSeries } from "@/api/tasks";
import { endMedicationAndDeleteFutureDoses, EndMedicationError } from "@/api/health/medications";
import { getErrorMessage } from "@/lib/errors";
import type { TaskDeleteOption } from "@/domain/tasks";
import type { Task } from "@/types/tasks";

/**
 * Feature 075 — a exclusão com escopo, compartilhada pelas três telas que a oferecem (`TaskList`,
 * `ProjectDetail` e `AgendaGrid`). Fica fora dos componentes porque as três precisam do **mesmo**
 * comportamento em duas situações que é fácil errar de formas diferentes em cada cópia:
 *
 * - **"Encerrar o tratamento" é uma operação de duas partes.** Ela não passa por `deleteTaskSeries`
 *   direto: desativar a `medication` vem antes de apagar as doses, senão a carga seguinte recria
 *   tudo (o "apago e volta" que originou a feature).
 * - **O erro parcial é caso de primeira classe.** Se o encerramento valeu e a exclusão falhou, a
 *   tela precisa recarregar mesmo tendo dado erro: o tratamento **está** encerrado, e mostrar o
 *   estado velho faria o usuário achar que nada aconteceu.
 */
export interface ScopedDeleteContext {
  /** Recarrega a tela. Chamado no sucesso e também no erro parcial. */
  reload: () => void;
  notify: (toast: {
    title: string;
    description?: string;
    variant?: "destructive";
    duration?: number;
  }) => void;
}

/** "1 tarefa excluída" / "12 tarefas excluídas" — o número é a prova de que o escopo foi o inteiro. */
function removedLabel(count: number): string {
  return count === 1 ? "1 tarefa excluída" : `${count} tarefas excluídas`;
}

export async function runScopedTaskDelete(
  task: Task,
  option: TaskDeleteOption,
  ctx: ScopedDeleteContext
): Promise<void> {
  try {
    const removed =
      option.mode === "end-treatment"
        ? await endMedicationAndDeleteFutureDoses(task)
        : await deleteTaskSeries(task, option);

    ctx.notify({
      title: removedLabel(removed),
      description:
        option.mode === "end-treatment"
          ? "O tratamento foi encerrado — as doses não voltam na próxima carga."
          : undefined,
      duration: 2500,
    });
    ctx.reload();
  } catch (error) {
    ctx.notify({
      title: "Erro",
      description: getErrorMessage(error, "Não foi possível excluir as tarefas."),
      variant: "destructive",
    });
    // Encerrou mas não apagou: a tela tem de refletir o tratamento já encerrado.
    if (error instanceof EndMedicationError && error.stage === "delete") ctx.reload();
  }
}
