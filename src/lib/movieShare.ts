import type { Movie } from "@/types/movies";
import { formatMovieRating, getMovieRatingLabel } from "@/domain/movies";
import { BRAND as PRODUCT_BRAND, BRAND_COLORS } from "@/lib/brand";

const STORY_W = 1080;
const STORY_H = 1920;

/** Identidade visual do produto no card de share. */
const BRAND = {
  name: PRODUCT_BRAND.name,
  tagline: PRODUCT_BRAND.tagline,
  primary: BRAND_COLORS.primary,
  primaryDeep: BRAND_COLORS.primaryDeep,
  primarySoft: BRAND_COLORS.primarySoft,
  cinema: BRAND_COLORS.cinema,
  ink: BRAND_COLORS.ink,
  paper: BRAND_COLORS.paper,
  muted: "#94A3B8",
  gold: "#FBBF24",
  font: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
} as const;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
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

function drawCover(
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

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3
): number {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  let lines = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
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
  if (line) {
    ctx.fillText(line, x, yy);
    return yy;
  }
  return yy;
}

/**
 * Joinha outline (path Lucide) — leve e alinhado ao resto do card.
 */
function drawThumbsUpIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string
) {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-12, -12);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.stroke(new Path2D("M7 10v12"));
  ctx.stroke(
    new Path2D(
      "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"
    )
  );

  ctx.restore();
}

function drawRecommendBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  recommend: boolean
) {
  const accent = recommend ? "#BBF7D0" : "#FECACA";
  const r = 20;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = recommend
    ? "rgba(34, 197, 94, 0.2)"
    : "rgba(239, 68, 68, 0.2)";
  ctx.fill();
  ctx.strokeStyle = recommend
    ? "rgba(187, 247, 208, 0.4)"
    : "rgba(254, 202, 202, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (recommend) {
    drawThumbsUpIcon(ctx, cx, cy + 0.5, 24, accent);
  } else {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI);
    drawThumbsUpIcon(ctx, 0, -0.5, 24, accent);
    ctx.restore();
  }
}

function drawBrandMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
) {
  // Marca geométrica: losango em sky
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);

  const half = size / 2;
  ctx.fillStyle = BRAND.primary;
  ctx.fillRect(-half, -half, size, size);

  ctx.fillStyle = BRAND.primaryDeep;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(-half * 0.45, -half * 0.45, size * 0.9, size * 0.9);
  ctx.globalAlpha = 1;

  ctx.fillStyle = BRAND.paper;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Card Stories com identidade visual do produto:
 * pôster em atmosfera + tipografia + marca.
 */
export async function generateMovieShareImage(
  movie: Movie,
  options: { includeNotes?: boolean } = {}
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const includeNotes = options.includeNotes !== false;
  const notes = includeNotes ? movie.notes?.trim() : "";

  const posterUrl = movie.poster && movie.poster !== "N/A" ? movie.poster : null;
  const poster = posterUrl ? await loadImage(posterUrl) : null;

  // ── Fundo atmosférico ──────────────────────────────────────────────
  ctx.fillStyle = BRAND.ink;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  if (poster) {
    ctx.save();
    ctx.filter = "blur(48px) saturate(1.25) brightness(0.55)";
    drawCover(ctx, poster, -80, -80, STORY_W + 160, STORY_H + 160);
    ctx.restore();
  }

  // Overlay de marca (sky → ink)
  const wash = ctx.createLinearGradient(0, 0, STORY_W, STORY_H);
  wash.addColorStop(0, "rgba(14, 165, 233, 0.48)");
  wash.addColorStop(0.45, "rgba(11, 15, 26, 0.35)");
  wash.addColorStop(1, "rgba(2, 132, 199, 0.32)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  // Vinheta inferior para tipografia
  const vignette = ctx.createLinearGradient(0, STORY_H * 0.45, 0, STORY_H);
  vignette.addColorStop(0, "rgba(11, 15, 26, 0)");
  vignette.addColorStop(0.55, "rgba(11, 15, 26, 0.72)");
  vignette.addColorStop(1, "rgba(11, 15, 26, 0.96)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  // ── Header da marca ────────────────────────────────────────────────
  drawBrandMark(ctx, 96, 96, 44);
  ctx.textAlign = "left";
  ctx.fillStyle = BRAND.paper;
  ctx.font = `700 34px ${BRAND.font}`;
  ctx.fillText(BRAND.name, 132, 108);

  ctx.fillStyle = "rgba(248, 250, 252, 0.55)";
  ctx.font = `500 22px ${BRAND.font}`;
  ctx.fillText("MINHA OPINIÃO", 132, 142);

  // ── Pôster principal ───────────────────────────────────────────────
  const posterW = 680;
  const posterH = 1020;
  const posterX = (STORY_W - posterW) / 2;
  const posterY = 220;
  const radius = 36;

  // Sombra profunda
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 28;
  roundRect(ctx, posterX, posterY, posterW, posterH, radius);
  ctx.fillStyle = "#111827";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, posterX, posterY, posterW, posterH, radius);
  ctx.clip();
  if (poster) {
    drawCover(ctx, poster, posterX, posterY, posterW, posterH);
  } else {
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(posterX, posterY, posterW, posterH);
  }
  ctx.restore();

  // Borda glass
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 3;
  roundRect(ctx, posterX, posterY, posterW, posterH, radius);
  ctx.stroke();

  // ── Bloco de conteúdo ──────────────────────────────────────────────
  let cursorY = posterY + posterH + 88;

  // Tipo + ano
  const meta = [
    movie.type === "series" ? "SÉRIE" : "FILME",
    String(movie.year),
  ].join("  ·  ");
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(248, 250, 252, 0.7)";
  ctx.font = `600 26px ${BRAND.font}`;
  ctx.fillText(meta, STORY_W / 2, cursorY);
  cursorY += 62;

  // Título
  ctx.fillStyle = BRAND.paper;
  ctx.font = `800 58px ${BRAND.font}`;
  cursorY = wrapText(
    ctx,
    movie.title,
    STORY_W / 2,
    cursorY,
    STORY_W - 140,
    68,
    3
  );
  cursorY += 54;

  // Nota em pill de produto
  if (movie.rating != null && movie.rating > 0) {
    const score = `${formatMovieRating(movie.rating)}`;
    const label = getMovieRatingLabel(movie.rating);
    const pillW = 480;
    const pillH = 132;
    const pillX = (STORY_W - pillW) / 2;
    const pillY = cursorY - 12;
    const pillCy = pillY + pillH / 2;

    ctx.save();
    ctx.shadowColor = BRAND.primarySoft;
    ctx.shadowBlur = 40;
    roundRect(ctx, pillX, pillY, pillW, pillH, 999);
    const pillGrad = ctx.createLinearGradient(
      pillX,
      pillY,
      pillX + pillW,
      pillY + pillH
    );
    pillGrad.addColorStop(0, BRAND.primary);
    pillGrad.addColorStop(1, BRAND.primaryDeep);
    ctx.fillStyle = pillGrad;
    ctx.fill();
    ctx.restore();

    roundRect(ctx, pillX, pillY, pillW, pillH, 999);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Bloco de texto centrado verticalmente no pill
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = BRAND.paper;
    ctx.font = `800 58px ${BRAND.font}`;
    ctx.fillText(`${score}/10`, STORY_W / 2, pillCy - 18);

    ctx.fillStyle = "rgba(248, 250, 252, 0.82)";
    ctx.font = `600 24px ${BRAND.font}`;
    ctx.fillText(label.toUpperCase(), STORY_W / 2, pillCy + 28);
    ctx.textBaseline = "alphabetic";

    cursorY = pillY + pillH + 48;
  }

  // Recomendação — chip + ícone, conteúdo centrado no chip
  if (movie.status === "watched") {
    const recommend = movie.would_recommend !== false;
    const rec = recommend ? "Recomendaria" : "Não recomendaria";
    const accent = recommend ? "#86EFAC" : "#FCA5A5";
    const chipW = recommend ? 340 : 400;
    const chipH = 68;
    const chipX = (STORY_W - chipW) / 2;
    const chipY = cursorY - 8;
    const chipCy = chipY + chipH / 2;

    roundRect(ctx, chipX, chipY, chipW, chipH, 999);
    ctx.fillStyle = recommend
      ? "rgba(34, 197, 94, 0.14)"
      : "rgba(239, 68, 68, 0.14)";
    ctx.fill();
    roundRect(ctx, chipX, chipY, chipW, chipH, 999);
    ctx.strokeStyle = recommend
      ? "rgba(134, 239, 172, 0.35)"
      : "rgba(252, 165, 165, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = `600 27px ${BRAND.font}`;
    const textW = ctx.measureText(rec).width;
    const iconR = 20;
    const gap = 14;
    const contentW = iconR * 2 + gap + textW;
    const contentLeft = chipX + (chipW - contentW) / 2;
    const iconCx = contentLeft + iconR;
    const textX = contentLeft + iconR * 2 + gap;

    drawRecommendBadge(ctx, iconCx, chipCy, recommend);

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = accent;
    ctx.fillText(rec, textX, chipCy + 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    cursorY = chipY + chipH + 40;
  }

  // Nota escrita (curta) — controlada por includeNotes
  if (notes) {
    ctx.fillStyle = "rgba(248, 250, 252, 0.55)";
    ctx.font = `500 26px ${BRAND.font}`;
    wrapText(
      ctx,
      `“${notes}”`,
      STORY_W / 2,
      cursorY + 8,
      STORY_W - 160,
      36,
      2
    );
  }

  // ── Footer de marca ────────────────────────────────────────────────
  const footerY = STORY_H - 110;
  ctx.strokeStyle = "rgba(248, 250, 252, 0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(160, footerY - 36);
  ctx.lineTo(STORY_W - 160, footerY - 36);
  ctx.stroke();

  drawBrandMark(ctx, STORY_W / 2 - 78, footerY - 4, 28);
  ctx.textAlign = "left";
  ctx.fillStyle = BRAND.paper;
  ctx.font = `700 28px ${BRAND.font}`;
  ctx.fillText(BRAND.name, STORY_W / 2 - 52, footerY + 6);

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(248, 250, 252, 0.4)";
  ctx.font = `500 20px ${BRAND.font}`;
  ctx.fillText(BRAND.tagline.toLowerCase(), STORY_W / 2, footerY + 40);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export function buildMovieShareText(
  movie: Movie,
  options: { includeNotes?: boolean } = {}
): string {
  const includeNotes = options.includeNotes !== false;
  const parts = [`🎬 ${movie.title} (${movie.year})`];
  if (movie.rating != null && movie.rating > 0) {
    parts.push(
      `⭐ ${formatMovieRating(movie.rating)}/10 — ${getMovieRatingLabel(movie.rating)}`
    );
  }
  if (includeNotes && movie.notes?.trim()) {
    parts.push(`💬 ${movie.notes.trim()}`);
  }
  if (movie.would_recommend === false) {
    parts.push("👎 Não recomendaria");
  } else if (movie.status === "watched") {
    parts.push("👍 Recomendaria");
  }
  parts.push(`via ${BRAND.name}`);
  return parts.join("\n");
}

export async function shareMovieNative(
  movie: Movie,
  imageBlob: Blob | null,
  options: { includeNotes?: boolean } = {}
): Promise<"shared" | "copied" | "downloaded" | "cancelled"> {
  const text = buildMovieShareText(movie, options);
  const file = toShareFile(movie, imageBlob);

  if (navigator.share) {
    try {
      const data: ShareData = { title: movie.title, text };
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
    if (imageBlob) downloadBlob(imageBlob, shareFilename(movie));
    return imageBlob ? "downloaded" : "copied";
  } catch {
    if (imageBlob) {
      downloadBlob(imageBlob, shareFilename(movie));
      return "downloaded";
    }
    throw new Error("Não foi possível compartilhar.");
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toShareFile(movie: Movie, imageBlob: Blob | null): File | null {
  if (!imageBlob) return null;
  return new File([imageBlob], shareFilename(movie), { type: "image/png" });
}

function shareFilename(movie: Movie): string {
  return `${slugify(movie.title)}-share.png`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}
