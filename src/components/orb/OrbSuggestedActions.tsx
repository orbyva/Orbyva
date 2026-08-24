import { Button } from "@/components/ui/button";
import type { OrbSuggestedAction } from "@/types/orb";

/** CTAs pós-ação — campo estruturado vindo da Edge, não texto livre do modelo. */
export function OrbSuggestedActions({
  actions,
  onPick,
}: {
  actions: OrbSuggestedAction[];
  onPick: (action: OrbSuggestedAction) => void;
}) {
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action.id}
          size="sm"
          variant="secondary"
          onClick={() => onPick(action)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
