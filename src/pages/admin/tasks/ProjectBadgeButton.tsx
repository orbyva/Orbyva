import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProjectPill } from "@/components/tasks/ProjectPill";
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
          {/* Sem `to`: aqui o pill é só a cara do gatilho — quem recebe o clique é o `<button>`
              de fora, e um `<a>` por dentro roubaria a navegação do popover (feature 111). */}
          <ProjectPill project={project} className="hover:bg-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-1.5"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Navegação, não escolha de projeto: fica **acima** da busca e do picker, separado por uma
            linha. O pill editável continua abrindo o picker no clique (features 029/033 dependem da
            troca em 1 clique na Lista/Kanban/Gantt), então o destino entra aqui dentro.
            É `<Link>` e não `navigate()` de propósito: ctrl/cmd-clique abrindo em nova aba é metade
            do valor de "ir para o projeto". Só aparece com projeto selecionado — tarefa sem projeto
            não tem para onde ir, e item morto no topo é pior que item nenhum. */}
        {project && (
          <div className="mb-1.5 border-b pb-1.5">
            <Link
              to={`/tasks/projects/${project.id}`}
              // Senão o popover fica órfão por cima da tela nova.
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Ir para o projeto</span>
            </Link>
          </div>
        )}
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
