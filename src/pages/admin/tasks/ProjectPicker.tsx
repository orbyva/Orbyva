import { cn } from "@/lib/utils";
import type { Project } from "@/types/tasks";
import { PROJECT_FALLBACK_COLOR } from "@/lib/design-tokens";

/**
 * Substitui o `<Select>` (dropdown) de Projeto no formulário de tarefa (`TaskList.tsx`) por uma
 * lista clicável — 1 clique seleciona, sem precisar abrir um menu. `projects` já vem ordenado por
 * atividade (ver `rankProjectsByActivity`); este componente só renderiza, não reordena.
 */
export function ProjectPicker({
  projects,
  value,
  onChange,
}: {
  /** Já ordenado por atividade (mais tarefas primeiro) — ver `rankProjectsByActivity`. */
  projects: Project[];
  value: string | null;
  onChange: (projectId: string | null) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="Projeto"
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
        <span className="truncate">Sem projeto</span>
      </button>
      {projects.map((project) => {
        const active = value === project.id;
        return (
          <button
            key={project.id}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onChange(project.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
              active && "bg-primary/10 font-medium text-primary"
            )}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: project.color ?? PROJECT_FALLBACK_COLOR }}
            />
            <span className="truncate">{project.name}</span>
          </button>
        );
      })}
    </div>
  );
}
