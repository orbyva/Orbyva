/**
 * Tool de DIÁLOGO (feature 107) — pergunta tipada ao usuário, sem gravar.
 *
 * Substitui o padrão frágil de "fale a pergunta no texto e espere" e o de `propose_create`
 * falhando com erro de campo faltando. O resultado vira cartão com chips; a resposta da pessoa
 * chega como próxima mensagem do chat.
 */

import type { OrbTool } from "../types.ts";
import { OrbToolError } from "../types.ts";
import { str } from "../helpers.ts";
import {
  ORB_ASK_USER_MAX_SUGGESTIONS,
  ORB_ASK_USER_TOOL_NAME,
  type OrbAskUser,
} from "../clarify.ts";

function sugestoes(input: Record<string, unknown>): string[] {
  const bruto = input.suggestions;
  if (bruto === undefined || bruto === null) return [];
  if (!Array.isArray(bruto)) {
    throw new OrbToolError(
      'O campo "suggestions" precisa ser uma lista de textos curtos (ex.: ["20:00", "21:00"]).'
    );
  }
  const limpas: string[] = [];
  for (const item of bruto) {
    if (typeof item !== "string") continue;
    const texto = item.trim();
    if (!texto) continue;
    if (limpas.includes(texto)) continue;
    limpas.push(texto);
    if (limpas.length >= ORB_ASK_USER_MAX_SUGGESTIONS) break;
  }
  return limpas;
}

export const askUser: OrbTool = {
  name: ORB_ASK_USER_TOOL_NAME,
  title: "Perguntar",
  description:
    "Faz UMA pergunta ao usuário quando falta um dado essencial para criar ou decidir " +
    "(horário de evento, categoria, escopo de orçamento 'só este mês ou próximos', " +
    "qual filme entre N resultados, etc.). " +
    "NÃO grava nada — devolve a pergunta que vira cartão com chips na tela. " +
    "Use ANTES de propose_create quando faltar slot; NÃO invente o valor só para chamar a criação. " +
    "Uma pergunta por vez. Prefira suggestions concretas (horários, nomes de categoria, opções).",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "A pergunta, em português, curta e direta (ex.: 'Que horas é o jogo?').",
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
        description:
          "Até 6 respostas rápidas que a pessoa pode tocar (ex.: ['20:00', '21:00']). Opcional.",
      },
    },
    required: ["question"],
    additionalProperties: false,
  },
  run: async (input) => {
    const question = str(input, "question")?.trim();
    if (!question) {
      throw new OrbToolError('A tool "ask_user" exige o campo "question" com um texto não vazio.');
    }
    const result: OrbAskUser = {
      status: "awaiting_user",
      question,
      suggestions: sugestoes(input),
    };
    return result;
  },
};

export const clarifyTools: OrbTool[] = [askUser];
