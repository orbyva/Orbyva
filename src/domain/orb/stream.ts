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

/* ── Formatação do cartão de tool ────────────────────────────────────────────────────────────── */

/** Resultado de tool já no formato que uma `<table>` consome: cabeçalho + células alinhadas. */
export interface OrbToolTable {
  colunas: string[];
  linhas: unknown[][];
}

function ehObjetoSimples(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Célula de tabela só aceita valor que cabe numa `<td>`; objeto aninhado não vira coluna. */
function ehEscalar(valor: unknown): boolean {
  return (
    valor === null ||
    valor === undefined ||
    typeof valor === "string" ||
    typeof valor === "number" ||
    typeof valor === "boolean"
  );
}

/**
 * A lista de linhas dentro do `summary`. As tools devolvem quase sempre um objeto com UMA lista
 * (`{start_date, end_date, transactions: [...]}`), então achar essa lista é o caso comum; duas
 * listas no mesmo objeto seriam ambíguas e caem fora — o cartão mostra o JSON.
 */
function linhasCandidatas(summary: unknown): unknown[] | null {
  if (Array.isArray(summary)) return summary;
  if (!ehObjetoSimples(summary)) return null;
  const listas = Object.values(summary).filter(Array.isArray) as unknown[][];
  return listas.length === 1 ? listas[0] : null;
}

/**
 * Converte o `summary` de uma tool em tabela quando ele é uma lista homogênea de objetos rasos, e
 * devolve `null` quando não é. Fica aqui, pura, porque é a decisão que o cartão de tool não deve
 * tomar: o componente só pergunta "dá tabela?" e renderiza o que voltar.
 */
export function resumoDeToolParaTabela(summary: unknown): OrbToolTable | null {
  const candidatas = linhasCandidatas(summary);
  if (!candidatas || candidatas.length === 0) return null;

  const primeira = candidatas[0];
  if (!ehObjetoSimples(primeira)) return null;
  const colunas = Object.keys(primeira);
  if (colunas.length === 0) return null;

  const linhas: unknown[][] = [];
  for (const item of candidatas) {
    // Homogênea de verdade: mesmo conjunto de chaves em todas as linhas. Uma lista irregular
    // viraria tabela com buraco silencioso, e buraco em número de dinheiro é pior que JSON cru.
    if (!ehObjetoSimples(item)) return null;
    if (Object.keys(item).length !== colunas.length) return null;
    if (!colunas.every((coluna) => coluna in item)) return null;

    const celulas = colunas.map((coluna) => item[coluna]);
    if (!celulas.every(ehEscalar)) return null;
    linhas.push(celulas);
  }

  return { colunas, linhas };
}

const INTEIRO_PT_BR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const DECIMAL_PT_BR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function ehNumeroValido(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0;
}

/** Duração de uma tool para o rodapé do cartão. Valor ausente ou inválido vira string vazia. */
export function formatarDuracao(ms?: number | null): string {
  if (!ehNumeroValido(ms)) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${DECIMAL_PT_BR.format(ms / 1000)} s`;

  let minutos = Math.floor(ms / 60_000);
  let segundos = Math.round((ms % 60_000) / 1000);
  if (segundos === 60) {
    minutos += 1;
    segundos = 0;
  }
  return segundos > 0 ? `${minutos} min ${segundos} s` : `${minutos} min`;
}

/** Tokens para o rodapé de custo: `412`, `12,4 mil`, `1,2 mi`. Inválido vira string vazia. */
export function formatarTokens(quantidade?: number | null): string {
  if (!ehNumeroValido(quantidade)) return "";
  if (quantidade < 1000) return INTEIRO_PT_BR.format(Math.round(quantidade));

  const emMilhares = quantidade / 1000;
  // O corte é 999,95 e não 1000 porque o arredondamento de uma casa transformaria 999.960 em
  // "1.000 mil" — o número certo, na unidade errada.
  if (emMilhares < 999.95) return `${DECIMAL_PT_BR.format(emMilhares)} mil`;
  return `${DECIMAL_PT_BR.format(quantidade / 1_000_000)} mi`;
}
