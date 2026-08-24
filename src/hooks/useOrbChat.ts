import { useCallback, useState } from "react";
import {
  applyOrbProposal,
  dismissOrbProposal,
  sendOrbMessage,
} from "@/api/orb";
import { buildSuggestedActionMessage } from "@/domain/orb/suggestedActions";
import type {
  OrbClarify,
  OrbProposal,
  OrbSuggestedAction,
} from "@/types/orb";

export interface OrbChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals?: OrbProposal[];
}

let localIdCounter = 0;
function localId(): string {
  localIdCounter += 1;
  return `local_${localIdCounter}`;
}

export function useOrbChat() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [turns, setTurns] = useState<OrbChatTurn[]>([]);
  const [suggestedActions, setSuggestedActions] = useState<OrbSuggestedAction[]>(
    []
  );
  const [clarify, setClarify] = useState<OrbClarify | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setSending(true);
      setError(null);
      setSuggestedActions([]);
      setClarify(null);
      setTurns((prev) => [
        ...prev,
        { id: localId(), role: "user", content: trimmed },
      ]);

      try {
        const response = await sendOrbMessage(threadId, trimmed);
        setThreadId(response.thread_id);
        setTurns((prev) => [
          ...prev,
          {
            id: response.message_id,
            role: "assistant",
            content: response.text,
            proposals: response.proposals.map((p) => ({
              ...p,
              status: "pending",
            })),
          },
        ]);
        setSuggestedActions(response.suggested_actions);
        setClarify(response.clarify);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Não consegui falar com o Orb agora."
        );
      } finally {
        setSending(false);
      }
    },
    [threadId, sending]
  );

  const applyProposal = useCallback(
    async (messageId: string, proposal: OrbProposal) => {
      try {
        const entityId = await applyOrbProposal(proposal);
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === messageId
              ? {
                  ...turn,
                  proposals: turn.proposals?.map((p) =>
                    p.id === proposal.id
                      ? { ...p, status: "applied", applied_entity_id: entityId }
                      : p
                  ),
                }
              : turn
          )
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Não consegui aplicar essa ação."
        );
      }
    },
    []
  );

  const dismissProposal = useCallback(
    async (messageId: string, proposal: OrbProposal) => {
      try {
        await dismissOrbProposal(proposal.id);
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === messageId
              ? {
                  ...turn,
                  proposals: turn.proposals?.map((p) =>
                    p.id === proposal.id ? { ...p, status: "dismissed" } : p
                  ),
                }
              : turn
          )
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Não consegui descartar essa ação."
        );
      }
    },
    []
  );

  const sendSuggestedAction = useCallback(
    (action: OrbSuggestedAction) => {
      const message = buildSuggestedActionMessage(action);
      if (!message) return;
      void sendMessage(message);
    },
    [sendMessage]
  );

  return {
    threadId,
    turns,
    suggestedActions,
    clarify,
    sending,
    error,
    sendMessage,
    applyProposal,
    dismissProposal,
    sendSuggestedAction,
  };
}
