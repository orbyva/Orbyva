import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { OrbAskUser } from "../../../supabase/functions/_shared/orb/clarify.ts";

/**
 * Cartão de pergunta tipada da Orb (feature 107).
 *
 * A tool `ask_user` devolve a pergunta + chips; tocar um chip manda a sugestão como próxima
 * mensagem do chat — o mesmo caminho do composer. Texto livre continua no campo de escrever.
 */
export function OrbClarifyCard({
  ask,
  onReply,
  disabled = false,
}: {
  ask: OrbAskUser;
  onReply?: (texto: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-start gap-2">
        <HelpCircle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{ask.question}</p>
      </div>

      {ask.suggestions.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {ask.suggestions.map((sugestao) => (
            <Button
              key={sugestao}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 max-w-full truncate px-2.5 text-xs"
              disabled={disabled || !onReply}
              onClick={() => onReply?.(sugestao)}
            >
              {sugestao}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
