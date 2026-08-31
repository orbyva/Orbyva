import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ProjectPicker } from "./ProjectPicker";
import type { Project } from "@/types/tasks";

/** Acima disso a lista clicável deixa de ser "escolha de 1 clique" e vira caça ao item — a regra
 * de 15+ da skill `form-design` manda combobox com busca. Abaixo, buscar seria atrito à toa. */
export const PROJECT_SEARCH_THRESHOLD = 15;

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
  const [search, setSearch] = useState("");
  const project = value ? (projects.find((p) => p.id === value) ?? null) : null;
  const searchable = projects.length > PROJECT_SEARCH_THRESHOLD;
  const visibleProjects =
    searchable && search.trim()
      ? projects.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
      : projects;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
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
        {searchable && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar projeto"
            aria-label="Buscar projeto"
            className="mb-1.5 h-8 w-56 text-xs"
          />
        )}
        <ProjectPicker
          projects={visibleProjects}
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
