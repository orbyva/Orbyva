import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { PROJECT_FALLBACK_COLOR } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/tasks";

/**
 * O pill de um projeto — bolinha na cor do projeto + nome — **em todo o app** (feature 111).
 *
 * Antes desta feature o mesmo pill existia desenhado de três formas diferentes (com bolinha e
 * editável na lista, sem bolinha e morto na nota, sem bolinha com botão ao lado no detalhe), e o
 * cinza de projeto sem cor estava copiado à mão em quatro arquivos. Aqui a cor vem **sempre** de
 * `project.color`, com `PROJECT_FALLBACK_COLOR` quando o projeto não tem nenhuma: pill de projeto
 * sem cor deixou de existir.
 *
 * **Nunca renderiza `<button>`.** Ele precisa poder viver dentro do gatilho do popover do
 * `ProjectBadgeButton`, e botão dentro de botão é markup inválido — o React reclama
 * (`validateDOMNesting`) e o clique do filho vira sorte. Por isso são só dois formatos:
 * - com `to`: um `<Link>` que leva ao projeto (é o que as features 112/113 usam para navegar);
 * - sem `to`: um `<span>` que só identifica.
 */
export function ProjectPill({
  project,
  to,
  emptyLabel = "Sem projeto",
  className,
}: {
  /** O projeto resolvido. `null` = tarefa/nota sem projeto: vira `emptyLabel` em cinza. */
  project: Project | null;
  /** Destino do clique (`/tasks/projects/:id`). Sem ele o pill não é interativo. */
  to?: string;
  /** Texto de "sem projeto" — o contexto pode querer outro ("Nenhum projeto", "Geral"). */
  emptyLabel?: string;
  className?: string;
}) {
  const content = (
    <>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        // A cor do projeto é dado do banco (hex), não classe do Tailwind: vai por `style` mesmo.
        style={{ backgroundColor: project?.color ?? PROJECT_FALLBACK_COLOR }}
        aria-hidden="true"
      />
      {project?.name ?? emptyLabel}
    </>
  );

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 text-[10px]", !project && "text-muted-foreground", className)}
      asChild
    >
      {to && project ? (
        <Link
          to={to}
          // O pill vive dentro de linha clicável (Lista, Kanban): sem isto, clicar nele abriria a
          // tarefa de trás **e** navegaria para o projeto. O clique do pill tem um destino só.
          onClick={(event) => event.stopPropagation()}
        >
          {content}
        </Link>
      ) : (
        <span>{content}</span>
      )}
    </Badge>
  );
}
