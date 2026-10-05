import type { OrbMessage } from "@/types/orb";

const BUBBLE_WIDTH = "92%";

/**
 * Balão da Orb precisa de largura definida: listas, cards e diagramas dentro dele usam `flex: 1`
 * e `width: "100%"`, que num pai que encolhe pelo conteúdo o Yoga resolve errado e o texto corta.
 * O do usuário é texto puro e continua encolhendo.
 */
export function orbBubbleWidth(
  role: OrbMessage["role"]
): { width: typeof BUBBLE_WIDTH } | { maxWidth: typeof BUBBLE_WIDTH } {
  return role === "user" ? { maxWidth: BUBBLE_WIDTH } : { width: BUBBLE_WIDTH };
}

const MIN_RATIO = 0.4;
const MAX_RATIO = 4;
const FALLBACK_RATIO = 16 / 9;

/** Proporção do diagrama a partir do tamanho real da imagem, limitada para não virar fita. */
export function diagramAspectRatio(width?: number, height?: number): number {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
    return FALLBACK_RATIO;
  }
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
}
