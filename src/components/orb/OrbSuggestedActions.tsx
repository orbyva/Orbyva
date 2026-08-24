import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { libraryLink } from "@/domain/orb/libraryLinks";
import { isNavigationAction } from "@/domain/orb/suggestedActions";
import type { OrbSuggestedAction } from "@/types/orb";

/** CTAs pós-ação — campo estruturado vindo da Edge, não texto livre do modelo. */
export function OrbSuggestedActions({
  actions,
  onPick,
  onNavigate,
}: {
  actions: OrbSuggestedAction[];
  onPick: (action: OrbSuggestedAction) => void;
  /** Chamado ao seguir um link — o sheet do Orb precisa fechar. */
  onNavigate?: () => void;
}) {
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        if (isNavigationAction(action)) {
          const link = libraryLink(action.args?.module, action.args?.status);
          // Sem destino válido, não renderiza: melhor nenhum chip do que um
          // que leva pra lugar nenhum.
          if (!link) return null;
          return (
            <Button
              key={action.id}
              size="sm"
              variant="secondary"
              asChild
              onClick={onNavigate}
            >
              <Link to={link.to}>
                {action.label || link.label}
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          );
        }

        return (
          <Button
            key={action.id}
            size="sm"
            variant="secondary"
            onClick={() => onPick(action)}
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}
