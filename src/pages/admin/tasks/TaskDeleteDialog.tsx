import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { findSeriesTasks, isSimpleRecurringTask } from "@/domain/tasks";
import type { Task } from "@/types/tasks";

interface TaskDeleteDialogProps {
  task: Task;
  /** Lista completa de tarefas do usuário — usada só para calcular a série via `findSeriesTasks`
   * quando `task` é uma recorrência simples; ignorada nos demais casos. */
  allTasks: Task[];
  /** Exclui só `task` — mesmo comportamento do `ConfirmDeleteDialog` de antes. */
  onConfirm: () => void | Promise<void>;
  /** Exclui todas as ocorrências da série. Quando ausente, o dialog nunca mostra a opção "todas
   * as ocorrências" — mesmo se `task` for uma recorrência simples. */
  onConfirmAll?: (ids: string[]) => void | Promise<void>;
  loading?: boolean;
  children: ReactNode;
  description?: string;
}

/**
 * Dialog de exclusão de tarefa. Para tarefas comuns (ou vinculadas a uma Recorrência
 * Financeira), comportamento idêntico ao antigo `ConfirmDeleteDialog`: um botão "Excluir".
 * Para tarefas de recorrência simples (`recurrence_rule`/`recurrence_origin_id`, sem
 * `linked_recurring_id`), mostra duas ações: excluir só essa ocorrência ou a série inteira.
 */
export function TaskDeleteDialog({
  task,
  allTasks,
  onConfirm,
  onConfirmAll,
  loading = false,
  children,
  description,
}: TaskDeleteDialogProps) {
  const isSeries = isSimpleRecurringTask(task) && !!onConfirmAll;
  const seriesIds = isSeries ? findSeriesTasks(allTasks, task).map((t) => t.id) : [];

  if (!isSeries) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>Excluir esta tarefa?</AlertDialogHeader>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void Promise.resolve(onConfirm()).catch(() => undefined);
              }}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>Excluir tarefa recorrente</AlertDialogHeader>
        <p className="text-sm text-muted-foreground">
          Essa tarefa faz parte de uma recorrência com {seriesIds.length} ocorrências. Você pode
          excluir só esta ocorrência ou todas de uma vez.
        </p>
        <AlertDialogFooter className="sm:flex-col sm:items-stretch sm:space-x-0 sm:space-y-2">
          <AlertDialogAction
            onClick={() => {
              void Promise.resolve(onConfirm()).catch(() => undefined);
            }}
            disabled={loading}
            className={cn(buttonVariants({ variant: "outline" }), "w-full text-foreground")}
          >
            Excluir somente esta
          </AlertDialogAction>
          <AlertDialogAction
            onClick={() => {
              void Promise.resolve(onConfirmAll?.(seriesIds)).catch(() => undefined);
            }}
            disabled={loading}
            className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir todas as ocorrências
          </AlertDialogAction>
          <AlertDialogCancel className="w-full">Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
