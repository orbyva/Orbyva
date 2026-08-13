import { FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/tasks";

/**
 * Coluna de projetos à esquerda da aba Lista (`TaskList.tsx`). Dispara o mesmo `projectFilter`
 * já usado pelo `<Select>` de Projeto — sem lógica de filtro nova, só um atalho visual. Clicar no
 * projeto já ativo desmarca (volta para "all"), clicar em "Todos os projetos" também limpa.
 */
export function ProjectsRail({
  projects,
  activeProjectId,
  onSelect,
}: {
  projects: Project[];
  /** Mesmo formato de `projectFilter` em `TaskList.tsx`: "all" | "null" | id do projeto. */
  activeProjectId: string;
  onSelect: (projectId: string) => void;
}) {
  return (
    <nav
      aria-label="Filtrar por projeto"
      className="shrink-0 space-y-1 rounded-lg border bg-card p-2 md:w-52"
    >
      <button
        type="button"
        onClick={() => onSelect("all")}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
          activeProjectId === "all" && "bg-primary/10 font-medium text-primary"
        )}
      >
        <FolderKanban className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Todos os projetos</span>
      </button>
      {projects.map((project) => {
        const active = activeProjectId === project.id;
        return (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelect(active ? "all" : project.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
              active && "bg-primary/10 font-medium text-primary"
            )}
            aria-current={active ? "true" : undefined}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: project.color ?? "#94a3b8" }}
            />
            <span className="truncate">{project.name}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onSelect(activeProjectId === "null" ? "all" : "null")}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted",
          activeProjectId === "null" && "bg-primary/10 font-medium text-primary"
        )}
      >
        <span className="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/40" />
        <span className="truncate">Sem projeto</span>
      </button>
    </nav>
  );
}
