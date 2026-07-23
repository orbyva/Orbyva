import { toOpenAiTools } from "../tools/definitions.ts";
import {
  AGENT_CADASTRO_RULES,
  AGENT_DIMENSION_RULES,
  AGENT_RESPONSE_STRUCTURE,
} from "../prompts/response-format.ts";

const AGENT_SYSTEM_PROMPT = `Você é um consultor financeiro de negócios do Orbyva — assistente profissional para tomada de decisão.

${AGENT_DIMENSION_RULES}

${AGENT_CADASTRO_RULES}

REGRAS:
1. NUNCA invente números — use SOMENTE dados das ferramentas.
2. Português do Brasil, tom de consultor profissional e acessível.
3. Use resolve_class antes de cadastrar; se faltar dado, PERGUNTE.
4. Combine ferramentas quando necessário para responder completamente.
5. Toda resposta DEVE ter interpretação — nunca apenas números secos.

${AGENT_RESPONSE_STRUCTURE}

Data atual: {{TODAY}}.`;

const MAX_TOOL_ITERATIONS = 4;

const FINALIZE_PROMPT =
  "Com base em TODAS as consultas acima, responda como consultor financeiro. " +
  "Use o formato Resumo / Detalhamento / Ponto de atenção / Recomendação. " +
  "Cite natureza, tipo e classe quando existirem nos dados. Somente dados das ferramentas.";

interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OrchestratorDeps {
  executeTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ result: unknown; pendingAction?: Record<string, unknown> }>;
}

function formatGroqHttpError(status: number, body: string): Error {
  if (status === 429) {
    return new Error(
      "Limite da API Groq atingido (429). Aguarde ~1 minuto ou verifique console.groq.com."
    );
  }
  if (status === 401 || status === 403) {
    return new Error(
      "Chave Groq inválida (403). Verifique GROQ_API_KEY nos secrets da Edge Function."
    );
  }
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) {
      return new Error(`Erro Groq: ${parsed.error.message}`);
    }
  } catch {
    // ignore
  }
  return new Error(`Erro na API Groq (${status}).`);
}

const NARRATOR_BASE = `Você é consultor financeiro de negócios do Orbyva.

${AGENT_DIMENSION_RULES}

REGRAS:
1. Use SOMENTE os dados JSON fornecidos. NUNCA invente valores.
2. Português do Brasil — profissional, claro, sem "Prezado usuário".
3. Não mencione JSON, APIs ou ferramentas.
4. Ao citar lançamentos ou agrupamentos, informe natureza, tipo e classe (dimensionLabel quando existir).
5. NUNCA diga que faltam dados se estiverem no JSON.

${AGENT_RESPONSE_STRUCTURE}`;

const CONSULTANT_NARRATOR_PROMPT = `${NARRATOR_BASE}

Modo: diagnóstico completo. Cruze análise, orçamento, parcelas, top despesas e histórico.
Priorize riscos (risks), oportunidades (opportunities) e insights da análise.

Data atual: {{TODAY}}.`;

const COMPARISON_NARRATOR_PROMPT = `${NARRATOR_BASE}

Modo: comparação entre meses. Use "months" e "comparison". Compare spendingRatePercent (% renda gasta) em cada mês.

Data atual: {{TODAY}}.`;

export async function runGroqNarrator(
  userMessage: string,
  prefetch: { intent: string; data: unknown },
  options?: { consultantMode?: boolean; comparisonMode?: boolean }
): Promise<{ message: string }> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("GROQ_API_KEY não configurada no servidor.");
  }

  const model = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
  const today = new Date().toISOString().slice(0, 10);
  const consultantMode = options?.consultantMode ?? prefetch.intent.includes("consultoria");
  const comparisonMode = options?.comparisonMode ?? prefetch.intent.includes("comparação");
  const systemPrompt = (
    comparisonMode
      ? COMPARISON_NARRATOR_PROMPT
      : consultantMode
        ? CONSULTANT_NARRATOR_PROMPT
        : `${NARRATOR_BASE}\n\nData atual: {{TODAY}}.`
  ).replace("{{TODAY}}", today);
  const maxTokens = comparisonMode ? 1100 : consultantMode ? 1600 : 1000;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            `Pergunta do usuário: ${userMessage}\n\n` +
            `Contexto da consulta: ${prefetch.intent}\n\n` +
            `Dados reais do Orbyva (use somente isto):\n` +
            `${JSON.stringify(prefetch.data)}`,
        },
      ],
      temperature: consultantMode ? 0.45 : 0.4,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    throw formatGroqHttpError(response.status, await response.text());
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Resposta vazia da Groq.");
  }

  return { message: content };
}

async function callGroqChat(
  apiKey: string,
  model: string,
  messages: GroqMessage[],
  options: { tools?: ReturnType<typeof toOpenAiTools>; toolChoice?: "auto" | "none" }
): Promise<GroqMessage> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: 1600,
  };

  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? "auto";
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw formatGroqHttpError(response.status, await response.text());
  }

  const data = await response.json();
  const choice = data.choices?.[0]?.message as GroqMessage | undefined;

  if (!choice) {
    throw new Error("Resposta inválida da Groq.");
  }

  return choice;
}

async function finalizeGroqAnswer(
  apiKey: string,
  model: string,
  chatMessages: GroqMessage[]
): Promise<string> {
  const choice = await callGroqChat(apiKey, model, [
    ...chatMessages,
    { role: "user", content: FINALIZE_PROMPT },
  ], {});

  if (choice.content?.trim()) {
    return choice.content.trim();
  }

  throw new Error("Resposta vazia da Groq.");
}

export async function runGroqOrchestrator(
  messages: Array<{ role: string; content: string }>,
  deps: OrchestratorDeps
): Promise<{ message: string; pendingAction?: Record<string, unknown> }> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("GROQ_API_KEY não configurada no servidor.");
  }

  const model = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = AGENT_SYSTEM_PROMPT.replace("{{TODAY}}", today);

  const chatMessages: GroqMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    })),
  ];

  let pendingAction: Record<string, unknown> | undefined;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const choice = await callGroqChat(apiKey, model, chatMessages, {
      tools: toOpenAiTools(),
      toolChoice: "auto",
    });

    if (choice.tool_calls?.length) {
      chatMessages.push(choice);

      for (const toolCall of choice.tool_calls) {
        const toolName = toolCall.function.name;
        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          args = {};
        }

        try {
          const { result, pendingAction: action } = await deps.executeTool(
            toolName,
            args
          );
          if (action) pendingAction = action;

          chatMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ result }),
          });
        } catch (toolError) {
          chatMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error:
                toolError instanceof Error
                  ? toolError.message
                  : "Erro na ferramenta",
            }),
          });
        }
      }

      continue;
    }

    if (choice.content?.trim()) {
      return { message: choice.content.trim(), pendingAction };
    }

    throw new Error("Resposta vazia da Groq.");
  }

  const message = await finalizeGroqAnswer(apiKey, model, chatMessages);
  return { message, pendingAction };
}
