import type { ToolDefinition } from "./registry.ts";
import { SUGGESTED_ACTION_KINDS, type OrbSuggestedActionKind } from "../types.ts";

let counter = 0;
function nextId(): string {
  counter += 1;
  return `sa_${Date.now()}_${counter}`;
}

export const suggestNextActionsTool: ToolDefinition = {
  name: "suggest_next_actions",
  description:
    "Sugere 1 a 3 ações de continuação pro usuário depois de uma proposta ou resposta (ex.: filmes parecidos, recomendar pra um amigo, abrir a lista na biblioteca). `action` só pode ser um dos valores aceitos — não invente outros.",
  input_schema: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Texto curto do botão" },
            action: { type: "string", enum: SUGGESTED_ACTION_KINDS },
            args: {
              type: "object",
              description:
                "Contexto opcional. Pra `open_library` é obrigatório: { module: movies|books|albums, status: da lista }. Pras demais, contexto livre (ex.: title).",
            },
          },
          required: ["label", "action"],
        },
      },
    },
    required: ["actions"],
  },
  handler: async (input, ctx) => {
    const actions = Array.isArray(input.actions) ? input.actions : [];
    let accepted = 0;
    for (const raw of actions) {
      if (typeof raw !== "object" || raw === null) continue;
      const entry = raw as Record<string, unknown>;
      const action = String(entry.action ?? "");
      if (!SUGGESTED_ACTION_KINDS.includes(action as OrbSuggestedActionKind)) {
        continue; // fora do enum validado — descarta silenciosamente
      }
      const label = String(entry.label ?? "").trim();
      if (!label) continue;
      ctx.suggestedActions.push({
        id: nextId(),
        label,
        action: action as OrbSuggestedActionKind,
        args:
          typeof entry.args === "object" && entry.args !== null
            ? (entry.args as Record<string, unknown>)
            : undefined,
      });
      accepted += 1;
    }
    return { ok: true, accepted };
  },
};
