/**
 * Montagem do pedido de imagem ao Gemini e leitura da resposta. Puro e tipado contra uma interface
 * mínima local — sem importar `npm:@google/genai`, porque o `tsc -b` do app typecheca este arquivo
 * quando o teste o importa.
 */

import type { OrbImageReference } from "./request.ts";

/** Motivos de parada que são recusa do modelo. Mesma lista de `orb-agent/index.ts`. */
export const RECUSAS = new Set([
  "SAFETY",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
  "RECITATION",
  "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT",
]);

export type ImagePart =
  | { inlineData: { mimeType: string; data: string } }
  | { text: string };

export type ImageRequest = {
  model: string;
  contents: { role: "user"; parts: ImagePart[] }[];
  config: { responseModalities: ["IMAGE"] };
};

export function buildImageRequest(input: {
  model: string;
  prompt: string;
  references: OrbImageReference[];
}): ImageRequest {
  return {
    model: input.model,
    contents: [
      {
        role: "user",
        parts: [
          ...input.references.map((ref) => ({
            inlineData: { mimeType: ref.mime, data: ref.data },
          })),
          { text: input.prompt },
        ],
      },
    ],
    config: { responseModalities: ["IMAGE"] },
  };
}

type ResponsePart = { text?: string; inlineData?: { mimeType?: string; data?: string } };
export type ImageResponse = {
  candidates?: { finishReason?: string; content?: { parts?: ResponsePart[] } }[];
  promptFeedback?: { blockReason?: string };
};

export type OrbImageErrorKind = "refused" | "no_image";

export class OrbImageError extends Error {
  readonly kind: OrbImageErrorKind;
  readonly reason?: string;

  constructor(kind: OrbImageErrorKind, message: string, reason?: string) {
    super(message);
    this.name = "OrbImageError";
    this.kind = kind;
    this.reason = reason;
  }
}

export function extractPngBase64(response: ImageResponse): { base64: string } {
  const blocked = response.promptFeedback?.blockReason;
  if (blocked) {
    throw new OrbImageError(
      "refused",
      "O modelo recusou esse pedido. Tente descrever a Orb de outro jeito.",
      blocked
    );
  }

  const candidate = response.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish && RECUSAS.has(finish)) {
    throw new OrbImageError(
      "refused",
      "O modelo recusou esse pedido. Tente descrever a Orb de outro jeito.",
      finish
    );
  }

  const image = candidate?.content?.parts?.find(
    (part) => part.inlineData?.data && (part.inlineData.mimeType ?? "").startsWith("image/")
  );
  if (!image?.inlineData?.data) {
    throw new OrbImageError(
      "no_image",
      "O modelo respondeu sem imagem. Tente de novo.",
      finish
    );
  }
  return { base64: image.inlineData.data };
}
