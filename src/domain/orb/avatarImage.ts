/**
 * Decisões sobre as imagens de referência da versão da Orb (feature 153), sem DOM. O desenho no
 * canvas mora em `src/lib/orbAvatarReference.ts` e só executa o que é decidido aqui.
 */

export const MAX_REFERENCES = 3;
/** Aresta maior depois do redimensionamento: 768 px em JPEG 0,85 cabe folgado nos 600 KB da função. */
export const REFERENCE_MAX_EDGE = 768;
export const REFERENCE_JPEG_QUALITY = 0.85;
export const REFERENCE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;

export type ReferenceMime = (typeof REFERENCE_MIMES)[number];

export function isSupportedReferenceMime(mime: string): mime is ReferenceMime {
  return (REFERENCE_MIMES as readonly string[]).includes(mime);
}

/** Preserva a proporção, arredonda e nunca amplia imagem menor que o teto. */
export function targetSize(
  size: { width: number; height: number },
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(size.width, size.height);
  if (longest <= maxEdge) return { width: size.width, height: size.height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}
