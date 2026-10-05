/**
 * Validação do corpo de `orb-avatar`. Puro (sem `Deno.*`, sem import externo): o Vitest roda e o
 * `tsc -b` do app typecheca por tabela.
 */

import { instantFromLocalTime } from "../_shared/orb/helpers.ts";

export const MAX_REFERENCES = 3;
/** O cliente redimensiona antes de subir; isto é a rede de segurança, não o caminho normal. */
export const MAX_REFERENCE_BASE64_BYTES = 600 * 1024;
export const MAX_TOTAL_BASE64_BYTES = 1800 * 1024;
export const MAX_PROMPT_CHARS = 500;
export const REFERENCE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;

export type ReferenceMime = (typeof REFERENCE_MIMES)[number];
export type OrbImageReference = { mime: ReferenceMime; data: string };
export type GenerateRequest = {
  prompt: string;
  references: OrbImageReference[];
  today: string;
  timezone: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isReferenceMime(value: unknown): value is ReferenceMime {
  return typeof value === "string" && (REFERENCE_MIMES as readonly string[]).includes(value);
}

/** Lança `Error` com mensagem em PT-BR pronta para a tela. */
export function parseGenerateRequest(body: unknown): GenerateRequest {
  if (!body || typeof body !== "object") throw new Error("Pedido inválido.");
  const raw = body as Record<string, unknown>;

  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!prompt) throw new Error("Descreva como você quer a sua Orb.");
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`O pedido passa de ${MAX_PROMPT_CHARS} caracteres. Resuma um pouco.`);
  }

  const rawRefs = raw.references ?? [];
  if (!Array.isArray(rawRefs)) throw new Error("Pedido inválido: referências mal formadas.");
  if (rawRefs.length > MAX_REFERENCES) {
    throw new Error(`Use no máximo ${MAX_REFERENCES} imagens de referência.`);
  }

  let total = 0;
  const references = rawRefs.map((item, index): OrbImageReference => {
    const ref = (item ?? {}) as Record<string, unknown>;
    const position = index + 1;
    if (!isReferenceMime(ref.mime)) {
      throw new Error(`A imagem ${position} precisa ser PNG, JPEG ou WebP.`);
    }
    const data = typeof ref.data === "string" ? ref.data : "";
    if (!data) throw new Error(`A imagem ${position} chegou vazia.`);
    if (data.length > MAX_REFERENCE_BASE64_BYTES) {
      throw new Error(`A imagem ${position} é grande demais. Use uma imagem menor.`);
    }
    total += data.length;
    if (total > MAX_TOTAL_BASE64_BYTES) {
      throw new Error("As imagens de referência somadas são grandes demais.");
    }
    return { mime: ref.mime, data };
  });

  const today = typeof raw.today === "string" ? raw.today : "";
  if (!ISO_DATE.test(today)) throw new Error("Pedido inválido: data do dia ausente.");
  const timezone =
    typeof raw.timezone === "string" && raw.timezone ? raw.timezone : "America/Sao_Paulo";

  return { prompt, references, today, timezone };
}

function nextIsoDate(isoDate: string): string {
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Dia do usuário no fuso dele: `[start, end)` em ISO, para contar as gerações de hoje. */
export function dailyWindow(today: string, timezone: string): { start: string; end: string } {
  return {
    start: instantFromLocalTime(today, "00:00", timezone),
    end: instantFromLocalTime(nextIsoDate(today), "00:00", timezone),
  };
}

export function remainingToday(usedToday: number, limit: number): number {
  return Math.max(0, limit - usedToday);
}
