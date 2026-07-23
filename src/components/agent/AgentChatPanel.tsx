import { useEffect, useState } from "react";
import { Send, Bot, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAgentChat } from "@/hooks/useAgentChat";
import { AgentMessageList } from "./AgentMessageList";
import { SuggestedQuestions } from "./SuggestedQuestions";

interface AgentChatPanelProps {
  variant?: "page" | "sheet";
}

const CAPABILITY_CHIPS = [
  "Consultas analíticas",
  "Insights proativos",
  "Tipo · Classe · Natureza",
  "Cadastro seguro",
];

export function AgentChatPanel({ variant = "page" }: AgentChatPanelProps) {
  const [input, setInput] = useState("");
  const {
    entries,
    loading,
    error,
    suggestedQuestions,
    initialize,
    sendMessage,
    confirmAction,
    cancelAction,
  } = useAgentChat();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input;
    setInput("");
    await sendMessage(text);
  };

  const isSheet = variant === "sheet";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        isSheet
          ? "bg-background"
          : "min-h-[min(75dvh,780px)] rounded-2xl border bg-card shadow-md ring-1 ring-border/50"
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-4 sm:px-5",
          isSheet && "pr-14"
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:h-11 sm:w-11">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight sm:text-lg">
                Consultor Orbyva
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary sm:text-xs">
                <Sparkles className="h-3 w-3" />
                IA
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Análises com seus dados reais · cadastros com confirmação
            </p>
            {!isSheet && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {CAPABILITY_CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-md border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground sm:text-[11px]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 py-3 sm:px-5 sm:py-4">
        <AgentMessageList
          entries={entries}
          loading={loading}
          onConfirm={confirmAction}
          onCancel={cancelAction}
          className="min-h-0 flex-1"
        />

        {error && (
          <p
            className="mt-2 shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="mt-3 shrink-0 space-y-3 border-t pt-3">
          <SuggestedQuestions
            questions={suggestedQuestions}
            disabled={loading}
            onSelect={(question) => sendMessage(question)}
          />

          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ex.: Qual foi meu saldo? Cadastre despesa de R$ 250..."
              disabled={loading}
              className="min-w-0 flex-1 border-border/80 bg-background"
            />
            <Button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-10 shrink-0 px-3 sm:px-4"
              aria-label="Enviar mensagem"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
