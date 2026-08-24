import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrbChat } from "@/hooks/useOrbChat";
import { OrbActionCard } from "@/components/orb/OrbActionCard";
import { OrbClarifyPrompt } from "@/components/orb/OrbClarify";
import { OrbSuggestedActions } from "@/components/orb/OrbSuggestedActions";
import { cn } from "@/lib/utils";

/** Abaixo disso consideramos que o usuário está "no fim" da conversa. */
const STICK_THRESHOLD_PX = 80;

function OrbThinkingBubble() {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex max-w-[85%] items-center gap-1.5 rounded-2xl bg-muted px-3 py-3"
        role="status"
        aria-label="Orb está pensando"
      >
        <span className="sr-only">Orb está pensando…</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function OrbChat() {
  const {
    turns,
    suggestedActions,
    clarify,
    sending,
    error,
    sendMessage,
    applyProposal,
    dismissProposal,
    sendSuggestedAction,
  } = useOrbChat();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Só cola no fim se o usuário já estava no fim — se ele rolou pra cima
  // para reler algo, não arrastamos a viewport embaixo dele.
  const stickToBottom = useRef(true);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distanceFromBottom < STICK_THRESHOLD_PX;
  }

  useEffect(() => {
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, sending, clarify, suggestedActions]);


  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft;
    setDraft("");
    stickToBottom.current = true;
    void sendMessage(text);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {turns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ex.: &ldquo;Assisti Gente Grande 2 e achei incrível, nota 4&rdquo;
          </p>
        ) : null}

        {turns.map((turn) => (
          <div
            key={turn.id}
            className={cn(
              "flex flex-col gap-2",
              turn.role === "user" && "items-end"
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                turn.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              )}
            >
              {turn.content}
            </div>
            {turn.proposals?.map((proposal) => (
              <OrbActionCard
                key={proposal.id}
                proposal={proposal}
                onConfirm={(rating) => void applyProposal(turn.id, proposal, rating)}
                onDismiss={() => void dismissProposal(turn.id, proposal)}
              />
            ))}
          </div>
        ))}

        {sending ? <OrbThinkingBubble /> : null}

        {clarify ? (
          <OrbClarifyPrompt clarify={clarify} onPick={(s) => void sendMessage(s)} />
        ) : null}
        {suggestedActions.length > 0 ? (
          <OrbSuggestedActions actions={suggestedActions} onPick={sendSuggestedAction} />
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t px-3 py-3"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Assisti, li ou ouvi algo?"
          disabled={sending}
          autoFocus
        />
        <Button type="submit" size="icon" disabled={sending || !draft.trim()}>
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
