import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Project, Task } from "@/types/tasks";

/** Teto de itens desenhados de uma vez: a lista de tarefas cresce sem limite (a de projetos não),
 * e renderizar tudo travaria o dialog. Quem não achou a tarefa refina a busca. */
const MAX_VISIBLE_TASKS = 50;

/**
 * Irmão do `ProjectPicker` para o vínculo "evento de tarefa" (feature 067): mesma lista clicável
 * com `role="listbox"`, mais um campo de busca — projeto o usuário tem alguns, tarefa ele tem
 * centenas, então sem filtro a lista não serve.
 *
 * O nome do projeto da tarefa aparece como texto secundário: é o que distingue duas tarefas
 * homônimas em projetos diferentes.
 */
export function TaskPicker({
  tasks,
  projects,
  value,
  onChange,
}: {
  tasks: Task[];
  projects: Project[];
  value: string | null;
  onChange: (taskId: string | null) => void;
}) {
  const [query, setQuery] = useState("");

  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matches = term
      ? tasks.filter((t) => t.title.toLowerCase().includes(term))
      : tasks;
    return matches.slice(0, MAX_VISIBLE_TASKS);
  }, [tasks, query]);

  const hiddenCount = useMemo(() => {
    const term = query.trim().toLowerCase();
    const total = term ? tasks.filter((t) => t.title.toLowerCase().includes(term)).length : tasks.length;
    return total - filtered.length;
  }, [tasks, query, filtered.length]);

  return (
    <div className="space-y-1.5">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar tarefa..."
        aria-label="Buscar tarefa"
        className="h-8 text-sm"
      />
      <div
        role="listbox"
        aria-label="Tarefa"
        className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1.5"
      >
        <button
          type="button"
          role="option"
          aria-selected={value === null}
          onClick={() => onChange(null)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted",
            value === null && "bg-primary/10 font-medium text-primary"
          )}
        >
          <span className="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/40" />
          <span className="truncate">Sem tarefa</span>
        </button>
        {filtered.map((task) => {
          const active = value === task.id;
          const projectName = task.project_id ? projectNameById.get(task.project_id) : null;
          return (
            <button
              key={task.id}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onChange(task.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                active && "bg-primary/10 font-medium text-primary"
              )}
            >
              <span className="min-w-0 truncate">{task.title}</span>
              {projectName && (
                <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                  {projectName}
                </span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma tarefa encontrada.</p>
        )}
        {hiddenCount > 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            +{hiddenCount} tarefa(s) — refine a busca.
          </p>
        )}
      </div>
    </div>
  );
}
