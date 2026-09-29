/**
 * Parser incremental do stream SSE da Orb. Puro de propósito (nada de fetch, nada de React): é a
 * parte que quebra em silêncio quando um chunk parte um evento no meio, e é o que o Vitest cobre.
 */

import type { OrbStreamEvent } from "@/types/orb";

const EVENT_SEPARATOR = "\n\n";

function toEvent(raw: string): OrbStreamEvent | null {
  const payload = raw
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!payload) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  const type = (parsed as { type?: unknown })?.type;
  if (type === "text" || type === "tool" || type === "done" || type === "error") {
    return parsed as OrbStreamEvent;
  }
  return null;
}

/**
 * Acumula pedaços de texto e devolve os eventos completos que já dá para entregar. O resto fica no
 * buffer até o próximo chunk — um `data:` cortado ao meio não pode virar evento descartado.
 */
export function createOrbStreamParser() {
  let buffer = "";

  return {
    push(chunk: string): OrbStreamEvent[] {
      buffer += chunk;
      const events: OrbStreamEvent[] = [];

      let index = buffer.indexOf(EVENT_SEPARATOR);
      while (index !== -1) {
        const event = toEvent(buffer.slice(0, index));
        if (event) events.push(event);
        buffer = buffer.slice(index + EVENT_SEPARATOR.length);
        index = buffer.indexOf(EVENT_SEPARATOR);
      }

      return events;
    },
    /** O último evento pode chegar sem a linha em branco final quando o servidor fecha o stream. */
    flush(): OrbStreamEvent[] {
      const event = buffer.trim() ? toEvent(buffer) : null;
      buffer = "";
      return event ? [event] : [];
    },
  };
}

const INTEIRO_PT_BR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const DECIMAL_PT_BR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function ehNumeroValido(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0;
}

/** Tokens para o rodapé de custo: `412`, `12,4 mil`, `1,2 mi`. */
export function formatarTokens(quantidade?: number | null): string {
  if (!ehNumeroValido(quantidade)) return "";
  if (quantidade < 1000) return INTEIRO_PT_BR.format(Math.round(quantidade));
  const emMilhares = quantidade / 1000;
  if (emMilhares < 999.95) return `${DECIMAL_PT_BR.format(emMilhares)} mil`;
  return `${DECIMAL_PT_BR.format(quantidade / 1_000_000)} mi`;
}
