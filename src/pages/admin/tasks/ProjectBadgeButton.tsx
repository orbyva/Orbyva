import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ProjectPicker } from "./ProjectPicker";
import type { Project } from "@/types/tasks";

/**
 * Badge do projeto, agora clicável — mostra a cor do projeto (bolinha) e o nome, ou "Sem projeto"
 * (neutro) quando a tarefa não tem nenhum. Abre um popover com o `ProjectPicker` já existente pra
 * trocar sem abrir o form completo — resolve principalmente o caso de tarefa sem projeto nenhum
 * (feature 029).
 */
export function ProjectBadgeButton({
  projects,
  value,
  onChange,
}: {
  /** Já ordenado por atividade — ver `rankProjectsByActivity`. */
  projects: Project[];
  value: string | null;
  onChange: (projectId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const project = value ? projects.find((p) => p.id === value) ?? null : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} className="shrink-0">
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 text-[10px] hover:bg-muted",
              !project && "text-muted-foreground"
            )}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: project?.color ?? "#94a3b8" }}
            />
            {project?.name ?? "Sem projeto"}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-1.5"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <ProjectPicker
          projects={projects}
          value={value}
          onChange={(projectId) => {
            onChange(projectId);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
