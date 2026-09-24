/**
 * Diálogo tipado da Orb (feature 107) — a tool `ask_user`.
 *
 * Quando falta um slot para criar (horário, categoria, escopo de orçamento…), o modelo chama isto
 * em vez de inventar o valor ou falhar em `propose_create`. O resultado vira cartão com chips na
 * tela; a pessoa responde (chip ou texto livre) e o turno seguinte continua.
 *
 * Não grava nada. É app-only: num host MCP não há UI de chips para coletar a resposta.
 */

/** Nome da tool. O client reconhece o cartão de pergunta por ele. */
export const ORB_ASK_USER_TOOL_NAME = "ask_user";

/** Teto de sugestões no cartão — mais que isso vira lista, não chips. */
export const ORB_ASK_USER_MAX_SUGGESTIONS = 6;

export interface OrbAskUser {
  status: "awaiting_user";
  question: string;
  suggestions: string[];
}

export function isOrbAskUser(valor: unknown): valor is OrbAskUser {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return false;
  const obj = valor as Record<string, unknown>;
  if (obj.status !== "awaiting_user") return false;
  if (typeof obj.question !== "string" || obj.question.trim() === "") return false;
  if (!Array.isArray(obj.suggestions)) return false;
  return obj.suggestions.every((s) => typeof s === "string");
}
