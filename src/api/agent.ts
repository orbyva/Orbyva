import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type {
  AgentChatRequest,
  AgentChatResponse,
  AgentMessage,
} from "@/domain/agent";

const AGENT_FUNCTION_NAME = "fintrack-agent";

async function parseFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      // ignore JSON parse errors
    }
    return error.message;
  }

  if (error instanceof Error) return error.message;
  return "Erro ao comunicar com o assistente.";
}

export async function sendAgentMessage(
  request: AgentChatRequest
): Promise<AgentChatResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const { data, error } = await supabase.functions.invoke(AGENT_FUNCTION_NAME, {
    body: request,
  });

  if (error) {
    throw new Error(await parseFunctionError(error));
  }

  const payload = data as AgentChatResponse & { error?: string };

  if (payload?.error) {
    throw new Error(payload.error);
  }

  return payload;
}

export async function fetchAgentWelcome(): Promise<AgentChatResponse> {
  return sendAgentMessage({ messages: [] });
}

export type { AgentMessage, AgentChatResponse };
