import type { ToolDefinition } from "./registry.ts";

export const askUserTool: ToolDefinition = {
  name: "ask_user",
  description:
    "Pergunta ao usuário quando faltar informação pra prosseguir (ex.: título ambíguo, mais de um resultado plausível no catálogo, campo obrigatório não informado). Encerra o turno sem propor nada.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string" },
      suggestions: {
        type: "array",
        items: { type: "string" },
        description: "Opções curtas de resposta rápida, se fizer sentido",
      },
    },
    required: ["question"],
  },
  handler: async (input, ctx) => {
    const question = String(input.question ?? "").trim();
    if (!question) return { error: "question é obrigatório." };
    const suggestions = Array.isArray(input.suggestions)
      ? (input.suggestions as unknown[]).map(String)
      : [];
    ctx.clarify = { question, suggestions };
    return { ok: true };
  },
};
