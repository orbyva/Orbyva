import { useCallback, useEffect, useState } from "react";
import { Gantt, Willow, WillowDark } from "@svar-ui/react-gantt";
import type { IApi } from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/all.css";
import {
  buildGanttLinks,
  buildGanttNodes,
  GANTT_PROJECT_NODE_PREFIX,
  type GanttDependencyInput,
  type GanttProjectInput,
  type GanttTaskInput,
} from "@/domain/tasks";
import { createDependency, deleteDependency, updateTask } from "@/api/tasks";
import { formatLocalIsoDate } from "@/lib/dates";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains("dark"));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function isProjectNodeId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith(GANTT_PROJECT_NODE_PREFIX);
}

export function GanttChart({
  tasks,
  projects = [],
  dependencies = [],
  onDataChanged,
}: {
  tasks: GanttTaskInput[];
  projects?: GanttProjectInput[];
  dependencies?: GanttDependencyInput[];
  /** Chamado depois que uma edição direto no Gantt (arrastar data, criar/remover dependência) é
   * persistida — quem usa `GanttChart` decide se/como recarregar sua própria lista de tarefas. */
  onDataChanged?: () => void;
}) {
  const isDark = useIsDarkMode();
  const { toast } = useToast();
  const { nodes, untimedCount } = buildGanttNodes(projects, tasks);
  const links = buildGanttLinks(dependencies, nodes);
  const ThemeWrapper = isDark ? WillowDark : Willow;

  const handleInit = useCallback(
    (api: IApi) => {
      // Projeto/summary é uma linha calculada, não uma tarefa real — não pode virar editável só
      // por estar na mesma árvore que tarefas e subtarefas.
      api.intercept("drag-task", ({ id }: { id: unknown }) => {
        if (isProjectNodeId(id)) return false;
      });
      api.intercept("update-task", ({ id }: { id: unknown }) => {
        if (isProjectNodeId(id)) return false;
      });
      api.intercept("add-link", ({ link }: { link: { source?: unknown; target?: unknown } }) => {
        if (isProjectNodeId(link.source) || isProjectNodeId(link.target)) return false;
      });
      // Reconectar uma ponta de um link existente arrastando fica fora de escopo — exclui e cria
      // de novo em vez disso (mais simples que reconciliar com `task_dependency`, que não modela
      // o "tipo" do link, só o par task/depends_on).
      api.intercept("update-link", () => false);

      api.on(
        "update-task",
        async ({
          id,
          task,
          inProgress,
        }: {
          id: unknown;
          task: { start?: Date; end?: Date };
          inProgress?: boolean;
        }) => {
          if (inProgress || typeof id !== "string" || isProjectNodeId(id)) return;
          const updates: { id: string; start_date?: string; due_date?: string } = { id };
          if (task.start instanceof Date) updates.start_date = formatLocalIsoDate(task.start);
          if (task.end instanceof Date) updates.due_date = formatLocalIsoDate(task.end);
          if (!updates.start_date && !updates.due_date) return;
          try {
            await updateTask(updates);
          } catch (error) {
            toast({
              title: "Erro",
              description: getErrorMessage(error, "Não foi possível salvar a nova data."),
              variant: "destructive",
            });
          } finally {
            onDataChanged?.();
          }
        }
      );

      api.on("add-link", async ({ link }: { link: { source?: unknown; target?: unknown } }) => {
        const source = typeof link.source === "string" ? link.source : null;
        const target = typeof link.target === "string" ? link.target : null;
        if (!source || !target) return;
        try {
          await createDependency(target, source);
        } catch (error) {
          toast({
            title: "Erro",
            description: getErrorMessage(error, "Não foi possível criar a dependência."),
            variant: "destructive",
          });
        } finally {
          onDataChanged?.();
        }
      });

      api.on("delete-link", async ({ id }: { id: unknown }) => {
        const [dependsOnTaskId, taskId] = String(id).split("->");
        if (!taskId || !dependsOnTaskId) return;
        try {
          await deleteDependency(taskId, dependsOnTaskId);
        } catch (error) {
          toast({
            title: "Erro",
            description: getErrorMessage(error, "Não foi possível remover a dependência."),
            variant: "destructive",
          });
        } finally {
          onDataChanged?.();
        }
      });
    },
    [onDataChanged, toast]
  );

  if (nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma tarefa com prazo ou início definido para mostrar no Gantt.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {untimedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {untimedCount} tarefa(s) sem prazo/início não aparecem aqui.
        </p>
      )}
      <div className="h-[600px] overflow-hidden rounded-lg border">
        <ThemeWrapper>
          <Gantt tasks={nodes} links={links} zoom init={handleInit} />
        </ThemeWrapper>
      </div>
    </div>
  );
}
