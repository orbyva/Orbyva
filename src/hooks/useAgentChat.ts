import { useCallback, useRef, useState } from "react";
import { sendAgentMessage, type AgentMessage } from "@/api/agent";
import type { AgentPendingAction } from "@/domain/agent";
import { AGENT_WELCOME_MESSAGE, SUGGESTED_QUESTIONS } from "@/domain/agent";
import { formatAgentErrorMessage } from "@/lib/agent-errors";

export interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  pendingAction?: AgentPendingAction;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useAgentChat() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([
    ...SUGGESTED_QUESTIONS,
  ]);
  const initializedRef = useRef(false);

  /** Boas-vindas locais — não chama Gemini nem Edge Function. */
  const initialize = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    setEntries([
      {
        id: createId(),
        role: "assistant",
        content: AGENT_WELCOME_MESSAGE,
      },
    ]);
  }, []);

  const toAgentMessages = useCallback(
    (history: ChatEntry[]): AgentMessage[] =>
      history.map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
    []
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userEntry: ChatEntry = {
        id: createId(),
        role: "user",
        content: trimmed,
      };

      const nextHistory = [...entries, userEntry];
      setEntries(nextHistory);
      setLoading(true);
      setError(null);

      try {
        const response = await sendAgentMessage({
          messages: toAgentMessages(nextHistory),
        });

        const assistantEntry: ChatEntry = {
          id: createId(),
          role: "assistant",
          content: response.message,
          pendingAction: response.pendingAction,
        };

        setEntries((prev) => [...prev, assistantEntry]);

        if (response.suggestedQuestions?.length) {
          setSuggestedQuestions(response.suggestedQuestions);
        }
      } catch (err) {
        const message = formatAgentErrorMessage(err);
        setError(message);
        setEntries((prev) => [
          ...prev,
          {
            id: createId(),
            role: "assistant",
            content: message,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [entries, loading, toAgentMessages]
  );

  const confirmAction = useCallback(
    async (actionId: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await sendAgentMessage({
          messages: toAgentMessages(entries),
          confirmActionId: actionId,
        });

        setEntries((prev) => [
          ...prev,
          {
            id: createId(),
            role: "assistant",
            content: response.message,
          },
        ]);
      } catch (err) {
        setError(formatAgentErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [entries, toAgentMessages]
  );

  const cancelAction = useCallback(
    async (actionId: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await sendAgentMessage({
          messages: toAgentMessages(entries),
          cancelActionId: actionId,
        });

        setEntries((prev) => [
          ...prev,
          {
            id: createId(),
            role: "assistant",
            content: response.message,
          },
        ]);
      } catch (err) {
        setError(formatAgentErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [entries, toAgentMessages]
  );

  return {
    entries,
    loading,
    error,
    suggestedQuestions,
    initialize,
    sendMessage,
    confirmAction,
    cancelAction,
  };
}
