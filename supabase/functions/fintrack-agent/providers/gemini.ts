import { FUNCTION_DECLARATIONS } from "../tools/definitions.ts";

const AGENT_SYSTEM_PROMPT = `Você é o assistente financeiro do FinTrack, um app de controle financeiro pessoal.

REGRAS OBRIGATÓRIAS:
1. NUNCA invente números. Use SOMENTE dados das ferramentas.
2. Responda em português do Brasil.
3. Valores em reais (R$).
4. Cadastros via propose_create_* com confirmação do usuário.
5. Seja conciso.

Data atual: {{TODAY}}.`;

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface OrchestratorDeps {
  executeTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ result: unknown; pendingAction?: Record<string, unknown> }>;
}

const MAX_TOOL_ITERATIONS = 2;

function mapMessagesToGeminiContents(
  messages: Array<{ role: string; content: string }>
): GeminiContent[] {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
}

function formatGeminiHttpError(status: number, body: string): Error {
  if (status === 429) {
    return new Error(
      "Limite da API Gemini atingido (429). Troque para Groq (GROQ_API_KEY) ou aguarde ~1 minuto."
    );
  }
  if (status === 403) {
    return new Error("Chave Gemini inválida. Verifique GEMINI_API_KEY no Supabase.");
  }
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } };
    if (parsed.error?.message) {
      if (status === 429 || parsed.error?.status === "RESOURCE_EXHAUSTED") {
        return new Error("Limite da API Gemini atingido. Use Groq ou aguarde o reset.");
      }
      return new Error(`Erro Gemini: ${parsed.error.message}`);
    }
  } catch {
    // ignore
  }
  return new Error(`Erro na API Gemini (${status}).`);
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  contents: GeminiContent[]
) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: 0.2 },
    }),
  });

  if (!response.ok) {
    throw formatGeminiHttpError(response.status, await response.text());
  }

  return response.json();
}

function extractModelParts(data: Record<string, unknown>): GeminiPart[] {
  const candidate = (data.candidates as Array<Record<string, unknown>>)?.[0];
  const content = candidate?.content as { parts?: GeminiPart[] } | undefined;
  return content?.parts ?? [];
}

function extractText(parts: GeminiPart[]): string {
  return parts
    .filter((part): part is { text: string } => "text" in part && !!part.text)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function extractFunctionCalls(parts: GeminiPart[]) {
  return parts.filter(
    (part): part is { functionCall: { name: string; args: Record<string, unknown> } } =>
      "functionCall" in part && !!part.functionCall?.name
  );
}

export async function runGeminiOrchestrator(
  messages: Array<{ role: string; content: string }>,
  deps: OrchestratorDeps
): Promise<{ message: string; pendingAction?: Record<string, unknown> }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY não configurada no servidor.");
  }

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash-lite";
  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = AGENT_SYSTEM_PROMPT.replace("{{TODAY}}", today);

  const contents = mapMessagesToGeminiContents(messages);
  let pendingAction: Record<string, unknown> | undefined;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await callGemini(apiKey, model, systemPrompt, contents);
    const parts = extractModelParts(data as Record<string, unknown>);
    const functionCalls = extractFunctionCalls(parts);

    if (functionCalls.length > 0) {
      contents.push({
        role: "model",
        parts: functionCalls.map((part) => ({
          functionCall: {
            name: part.functionCall.name,
            args: part.functionCall.args ?? {},
          },
        })),
      });

      const responseParts: GeminiPart[] = [];

      for (const part of functionCalls) {
        const toolName = part.functionCall.name;
        const args = part.functionCall.args ?? {};

        try {
          const { result, pendingAction: action } = await deps.executeTool(
            toolName,
            args
          );
          if (action) pendingAction = action;

          responseParts.push({
            functionResponse: {
              name: toolName,
              response: { result },
            },
          });
        } catch (toolError) {
          responseParts.push({
            functionResponse: {
              name: toolName,
              response: {
                error:
                  toolError instanceof Error
                    ? toolError.message
                    : "Erro na ferramenta",
              },
            },
          });
        }
      }

      contents.push({ role: "user", parts: responseParts });
      continue;
    }

    const text = extractText(parts);
    if (text) {
      return { message: text, pendingAction };
    }

    throw new Error("Resposta inválida do Gemini.");
  }

  return {
    message: "Precisei de muitas consultas. Tente reformular a pergunta.",
    pendingAction,
  };
}
