/** Diálogo tipado da Orb — tool `ask_user` (espelho do shared clarify). */

export const ORB_ASK_USER_TOOL_NAME = "ask_user";

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
