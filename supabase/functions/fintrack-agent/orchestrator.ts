import {
  formatDirectResponse,
  prefetchAgentData,
} from "./fast-path.ts";
import {
  isCadastroRequest,
  needsTransactionSearch,
  prefetchConsultantBriefing,
} from "./consultant-briefing.ts";
import { runGroqNarrator, runGroqOrchestrator } from "./providers/groq.ts";
import { runGeminiOrchestrator } from "./providers/gemini.ts";

interface OrchestratorDeps {
  executeTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ result: unknown; pendingAction?: Record<string, unknown> }>;
}

type LlmProvider = "groq" | "gemini";

function resolveProvider(): LlmProvider | null {
  const explicit = Deno.env.get("LLM_PROVIDER")?.toLowerCase();
  if (explicit === "groq" || explicit === "gemini") {
    return explicit;
  }
  if (Deno.env.get("GROQ_API_KEY")) return "groq";
  if (Deno.env.get("GEMINI_API_KEY")) return "gemini";
  return null;
}

function responseMode(): "agent" | "direct" {
  return Deno.env.get("AGENT_RESPONSE_MODE") === "direct" ? "direct" : "agent";
}

function isConsultantBriefing(prefetch: { intent: string }): boolean {
  return (
    prefetch.intent.includes("consultoria") ||
    prefetch.intent.includes("insights") ||
    prefetch.intent.includes("atenção") ||
    prefetch.intent.includes("maiores gastos") ||
    prefetch.intent.includes("impacto")
  );
}

function isComparisonBriefing(prefetch: { intent: string }): boolean {
  return prefetch.intent.includes("comparação");
}

async function narratePrefetch(
  provider: LlmProvider | null,
  userMessage: string,
  prefetch: { intent: string; data: unknown }
): Promise<{ message: string }> {
  if (responseMode() === "direct") {
    return { message: formatDirectResponse(prefetch) };
  }

  if (provider === "groq") {
    const narrated = await runGroqNarrator(userMessage, prefetch, {
      consultantMode: isConsultantBriefing(prefetch),
      comparisonMode: isComparisonBriefing(prefetch),
    });
    return { message: narrated.message };
  }

  return { message: formatDirectResponse(prefetch) };
}

export async function runAgentOrchestrator(
  messages: Array<{ role: string; content: string }>,
  deps: OrchestratorDeps
): Promise<{ message: string; pendingAction?: Record<string, unknown> }> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const provider = resolveProvider();

  if (lastUser && !isCadastroRequest(lastUser.content)) {
    const prefetch = await prefetchAgentData(lastUser.content, deps);

    if (prefetch) {
      return narratePrefetch(provider, lastUser.content, prefetch);
    }

    if (!needsTransactionSearch(lastUser.content)) {
      const briefing = await prefetchConsultantBriefing(deps);
      return narratePrefetch(provider, lastUser.content, briefing);
    }
  }

  if (!provider) {
    throw new Error(
      "Nenhum provedor de IA configurado. Defina GROQ_API_KEY (console.groq.com) nos secrets da Edge Function fintrack-agent."
    );
  }

  if (provider === "groq") {
    return runGroqOrchestrator(messages, deps);
  }

  return runGeminiOrchestrator(messages, deps);
}
