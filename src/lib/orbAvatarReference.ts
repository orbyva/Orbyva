import type { OrbAvatarReference } from "@/api/orbAvatars";
import {
  isSupportedReferenceMime,
  REFERENCE_JPEG_QUALITY,
  REFERENCE_MAX_EDGE,
  targetSize,
} from "@/domain/orb/avatarImage";

/**
 * Arquivo escolhido → referência redimensionada em JPEG base64 (feature 153). Camada fina: o
 * tamanho é decidido por `targetSize` (testado); aqui só se desenha. O que sobe é sempre o
 * redimensionado, nunca o original.
 */
export async function fileToReference(file: File): Promise<OrbAvatarReference> {
  if (!isSupportedReferenceMime(file.type)) {
    throw new Error("Use imagens PNG, JPEG ou WebP.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = targetSize(
      { width: bitmap.width, height: bitmap.height },
      REFERENCE_MAX_EDGE
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas não suportado");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", REFERENCE_JPEG_QUALITY);
    return { mime: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  } finally {
    bitmap.close();
  }
}
