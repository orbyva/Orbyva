import { Button } from "@/components/ui/button";
import type { OrbClarify } from "@/types/orb";

/** Chips de resposta rápida pra pergunta do Orb — o texto da pergunta já é o `content` do turno. */
export function OrbClarifyPrompt({
  clarify,
  onPick,
}: {
  clarify: OrbClarify;
  onPick: (suggestion: string) => void;
}) {
  if (!clarify.suggestions.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {clarify.suggestions.map((suggestion) => (
        <Button
          key={suggestion}
          size="sm"
          variant="outline"
          onClick={() => onPick(suggestion)}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
}
