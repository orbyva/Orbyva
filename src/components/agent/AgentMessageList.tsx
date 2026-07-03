import { useEffect, useRef } from "react";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseAgentMessage } from "@/lib/agent-message-parser";
import { AgentConfirmationCard } from "./AgentConfirmationCard";
import { AgentStructuredMessage } from "./AgentStructuredMessage";
import type { ChatEntry } from "@/hooks/useAgentChat";
import type { AgentPendingAction } from "@/domain/agent";

interface AgentMessageListProps {
  entries: ChatEntry[];
  loading?: boolean;
  className?: string;
  onConfirm: (actionId: string) => void;
  onCancel: (actionId: string) => void;
}

export function AgentMessageList({
  entries,
  loading,
  className,
  onConfirm,
  onCancel,
}: AgentMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, loading]);

  return (
    <div className={cn("overflow-y-auto overscroll-contain pr-0.5", className)}>
      <div className="space-y-4 sm:space-y-5">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={cn(
              "flex gap-2.5 sm:gap-3",
              entry.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {entry.role === "assistant" && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/20 sm:h-9 sm:w-9">
                <Bot className="h-4 w-4" />
              </div>
            )}

            <div
              className={cn(
                "min-w-0 max-w-[min(100%,20rem)] break-words sm:max-w-[min(92%,36rem)]",
                entry.role === "user"
                  ? "rounded-2xl bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm sm:px-4"
                  : "rounded-2xl border border-border/60 bg-card px-3 py-3 shadow-sm sm:px-4 sm:py-3.5"
              )}
            >
              {entry.role === "assistant" ? (
                <AgentStructuredMessage sections={parseAgentMessage(entry.content)} />
              ) : (
                <p className="text-sm leading-relaxed">{entry.content}</p>
              )}

              {entry.pendingAction && (
                <AgentConfirmationCard
                  pendingAction={entry.pendingAction as AgentPendingAction}
                  loading={loading}
                  onConfirm={onConfirm}
                  onCancel={onCancel}
                />
              )}
            </div>

            {entry.role === "user" && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted sm:h-9 sm:w-9">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-primary/25 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground sm:text-sm">
            <Bot className="h-4 w-4 shrink-0 animate-pulse text-primary" />
            <span>Consultando seus dados e preparando análise...</span>
          </div>
        )}

        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>
    </div>
  );
}
