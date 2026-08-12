/** Utilitários compartilhados para cards de share (Stories 1080×1920). */

import { BRAND, BRAND_COLORS } from "@/lib/brand";

export const SHARE_W = 1080;
export const SHARE_H = 1920;

export const SHARE_BRAND = {
  name: BRAND.name,
  tagline: BRAND.tagline,
  logoSlogan: BRAND.logoSlogan,
  wedge: BRAND.wedge,
  primary: BRAND_COLORS.primary,
  primarySoft: BRAND_COLORS.primarySoft,
  primaryDeep: BRAND_COLORS.primaryDeep,
  accent: BRAND_COLORS.cinema,
  ink: BRAND_COLORS.ink,
  paper: BRAND_COLORS.paper,
  muted: "#94A3B8",
  gold: "#FBBF24",
  font: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
} as const;

/** No-op mantido para os geradores (marca é vetorial nos shares). */
export async function ensureShareBrandAssets(): Promise<void> {
  /* mark desenhado via drawBrandMark, sem asset com fundo branco */
}

/** Wordmark ORBYVA, O/A em sky, RBYV em paper (como na logo). */
export function drawOrbyvaWordmark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): number {
  const letters: { ch: string; color: string }[] = [
    { ch: "O", color: SHARE_BRAND.primary },
    { ch: "R", color: SHARE_BRAND.paper },
    { ch: "B", color: SHARE_BRAND.paper },
    { ch: "Y", color: SHARE_BRAND.paper },
    { ch: "V", color: SHARE_BRAND.paper },
    { ch: "A", color: SHARE_BRAND.primary },
  ];
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${size}px ${SHARE_BRAND.font}`;
  let cursor = x;
  for (const { ch, color } of letters) {
    ctx.fillStyle = color;
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width;
  }
  ctx.restore();
  return cursor - x;
}

/** Slogan da lockup: “… ÓRBITA.” com a última palavra em sky. */
export function drawLogoSlogan(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  fontSize = 18
) {
  const prefix = "TUDO DA SUA VIDA EM UMA SÓ ";
  const accent = "ÓRBITA.";
  ctx.save();
  ctx.font = `600 ${fontSize}px ${SHARE_BRAND.font}`;
  ctx.textBaseline = "alphabetic";
  const w1 = ctx.measureText(prefix).width;
  const w2 = ctx.measureText(accent).width;
  const start = cx - (w1 + w2) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(248, 250, 252, 0.45)";
  ctx.fillText(prefix, start, y);
  ctx.fillStyle = SHARE_BRAND.primary;
  ctx.fillText(accent, start + w1, y);
  ctx.restore();
}

function drawShareMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
) {
  // Vetorial: o logo-mark.webp tem fundo branco e vira um quadrado no card.
  drawBrandMark(ctx, cx, cy, size);
}

export function createShareCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado.");
  return { canvas, ctx };
}

export function paintShareBackground(
  ctx: CanvasRenderingContext2D,
  top = BRAND_COLORS.primaryDark,
  bottom = BRAND_COLORS.ink
) {
  const g = ctx.createLinearGradient(0, 0, 0, SHARE_H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
}

/**
 * Marca Orbyva, O + órbita + satélite (canvas shares).
 * `cx`/`cy` são o centro do mark.
 */
export function drawBrandMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
) {
  const r = size * 0.42;
  const stroke = Math.max(3, size * 0.18);
  ctx.save();
  ctx.strokeStyle = SHARE_BRAND.primary;
  ctx.fillStyle = SHARE_BRAND.primary;
  ctx.lineCap = "round";

  // Órbita diagonal
  ctx.beginPath();
  ctx.ellipse(cx + size * 0.04, cy, size * 0.52, size * 0.18, -Math.PI / 5, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.stroke();

  // Anel O
  ctx.beginPath();
  ctx.arc(cx - size * 0.04, cy + size * 0.02, r, 0, Math.PI * 2);
  ctx.lineWidth = stroke;
  ctx.stroke();

  // Satélite
  ctx.beginPath();
  ctx.arc(cx + r * 0.85, cy - r * 0.85, size * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawShareHeader(
  ctx: CanvasRenderingContext2D,
  eyebrow: string
) {
  const markCx = 88;
  const markCy = 100;
  const markSize = 40;
  drawShareMark(ctx, markCx, markCy, markSize);

  const textX = markCx + markSize * 0.75;
  drawOrbyvaWordmark(ctx, textX, markCy + 10, 32);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(248, 250, 252, 0.55)";
  ctx.font = `500 20px ${SHARE_BRAND.font}`;
  ctx.fillText(eyebrow.toUpperCase(), textX, markCy + 40);
}

export function drawShareFooter(ctx: CanvasRenderingContext2D) {
  const footerY = SHARE_H - 120;
  ctx.strokeStyle = "rgba(248, 250, 252, 0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(160, footerY - 48);
  ctx.lineTo(SHARE_W - 160, footerY - 48);
  ctx.stroke();

  const markSize = 28;
  ctx.font = `800 28px ${SHARE_BRAND.font}`;
  const nameW = ctx.measureText("ORBYVA").width;
  const gap = 12;
  const markSpan = markSize * 1.1;
  const totalW = markSpan + gap + nameW;
  const left = SHARE_W / 2 - totalW / 2;
  drawShareMark(ctx, left + markSpan / 2, footerY - 6, markSize);
  drawOrbyvaWordmark(ctx, left + markSpan + gap, footerY + 4, 28);
  drawLogoSlogan(ctx, SHARE_W / 2, footerY + 42, 17);
}
export function roundSharePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
export function wrapShareText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 4
): number {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  let lines = 0;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines += 1;
      if (lines >= maxLines) {
        let clipped = line;
        while (
          clipped.length > 1 &&
          ctx.measureText(`${clipped}…`).width > maxWidth
        ) {
          clipped = clipped.slice(0, -1);
        }
        ctx.fillText(`${clipped}…`, x, yy);
        return yy;
      }
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
  return yy;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function canvasToPngBlob(
  canvas: HTMLCanvasElement
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/** Carrega imagem a partir de File (anexo no share). */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a foto."));
    };
    img.src = url;
  });
}

/** Desenha imagem cobrindo o retângulo (cover). */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
export async function shareNativePayload(options: {
  title: string;
  text: string;
  filename: string;
  imageBlob: Blob | null;
}): Promise<"shared" | "copied" | "downloaded" | "cancelled"> {
  const { title, text, filename, imageBlob } = options;
  const file = imageBlob
    ? new File([imageBlob], filename, { type: "image/png" })
    : null;

  if (navigator.share) {
    try {
      const data: ShareData = { title, text };
      if (file && navigator.canShare?.({ files: [file] })) {
        data.files = [file];
      }
      await navigator.share(data);
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "cancelled";
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    if (imageBlob) downloadBlob(imageBlob, filename);
    return imageBlob ? "downloaded" : "copied";
  } catch {
    if (imageBlob) {
      downloadBlob(imageBlob, filename);
      return "downloaded";
    }
    throw new Error("Não foi possível compartilhar.");
  }
}

export * from "./shareKitStory";
