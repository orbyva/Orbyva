import { TypeScale } from "@/domain/ui/typography";

/**
 * Avanço de cada caractere de valor monetário em Syne 700, em `em`, lido do `hmtx` de
 * `Syne_700Bold.ttf`. Trocar a fonte de `TypeScale.value` exige medir de novo.
 */
const SYNE_700_ADVANCE: Record<string, number> = {
  "0": 0.738, "1": 0.39, "2": 0.624, "3": 0.641, "4": 0.711,
  "5": 0.685, "6": 0.689, "7": 0.643, "8": 0.675, "9": 0.697,
  R: 0.826, $: 0.559, ".": 0.271, ",": 0.231, "-": 0.494, "\u2212": 0.49,
  " ": 0.241, "\u00a0": 0.241, "%": 0.948,
};
/** Caractere fora da tabela conta como o dígito mais largo — erra para caber, não para estourar. */
const FALLBACK_ADVANCE = 0.75;
const SAFETY = 0.96;
const MIN_SIZE = 16;

/** Largura do texto em `em` de Syne 700. */
export function valueWidthEm(text: string): number {
  let total = 0;
  for (const ch of text) total += SYNE_700_ADVANCE[ch] ?? FALLBACK_ADVANCE;
  return total;
}

/**
 * Um só tamanho de fonte para um grupo de valores lado a lado (KPIs): o maior que faz o valor mais
 * largo caber em `width`, entre `MIN_SIZE` e `TypeScale.value`. Valores vizinhos ficam iguais em
 * vez de cada um encolher por conta própria.
 */
export function sharedValueSize(values: string[], width: number): { fontSize: number; lineHeight: number } {
  const max = TypeScale.value.fontSize;
  const widest = Math.max(0, ...values.map(valueWidthEm));
  const fit = widest > 0 ? Math.floor((width * SAFETY) / widest) : max;
  const fontSize = Math.max(MIN_SIZE, Math.min(max, fit));
  return { fontSize, lineHeight: Math.round(fontSize * (TypeScale.value.lineHeight / max)) };
}
