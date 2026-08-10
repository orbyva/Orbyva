import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { fetchDependencies, fetchProjects, fetchTasks } from "@/api/tasks";
import type { Project, Task, TaskDependency } from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { GanttChart } from "./GanttChart";

export default function TasksGantt() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [taskList, projectList, dependencyList] = await Promise.all([
        fetchTasks(),
        fetchProjects(),
        fetchDependencies(),
      ]);
      setTasks(taskList);
      setProjects(projectList);
      setDependencies(dependencyList);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar o Gantt."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !(t.linked_recurring_id && t.linked_installment_number == null) &&
          (projectFilter === "all" ? true : t.project_id === projectFilter)
      ),
    [tasks, projectFilter]
  );

  const filteredProjects = useMemo(
    () => (projectFilter === "all" ? projects : projects.filter((p) => p.id === projectFilter)),
    [projects, projectFilter]
  );

  return (
    <PageShell
      title="Gantt"
      description="Linha do tempo de tarefas com prazo, cruzando todos os projetos."
      eyebrow="Produtividade"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="h-8 w-48">
            <SelectValue placeholder="Todos os projetos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os projetos</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <TableLoadingSkeleton />
      ) : tasks.length === 0 ? (
        <EmptyState title="Nenhuma tarefa ainda" description="Crie tarefas em Tarefas ou Projetos para vê-las aqui." />
      ) : (
        <GanttChart
          tasks={filteredTasks}
          projects={filteredProjects}
          dependencies={dependencies}
          onDataChanged={load}
        />
      )}
    </PageShell>
  );
}
