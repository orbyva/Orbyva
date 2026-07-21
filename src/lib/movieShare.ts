import type { Movie } from "@/types/movies";
import { formatMovieRating, getMovieRatingLabel } from "@/domain/movies";

const STORY_W = 1080;
const STORY_H = 1920;

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

/**
 * Gera um card vertical (Stories) com pôster, título e nota.
 */
export async function generateMovieShareImage(
  movie: Movie
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Fundo escuro cinematográfico
  const bg = ctx.createLinearGradient(0, 0, 0, STORY_H);
  bg.addColorStop(0, "#0b1220");
  bg.addColorStop(0.55, "#121a2b");
  bg.addColorStop(1, "#1a1030");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  // Poster
  const posterUrl = movie.poster && movie.poster !== "N/A" ? movie.poster : null;
  const poster = posterUrl ? await loadImage(posterUrl) : null;
  const posterW = 720;
  const posterH = 1080;
  const posterX = (STORY_W - posterW) / 2;
  const posterY = 180;

  ctx.save();
  roundRect(ctx, posterX, posterY, posterW, posterH, 28);
  ctx.clip();
  if (poster) {
    // cover
    const scale = Math.max(posterW / poster.width, posterH / poster.height);
    const sw = posterW / scale;
    const sh = posterH / scale;
    const sx = (poster.width - sw) / 2;
    const sy = (poster.height - sh) / 2;
    ctx.drawImage(poster, sx, sy, sw, sh, posterX, posterY, posterW, posterH);
  } else {
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(posterX, posterY, posterW, posterH);
  }
  ctx.restore();

  // Sombra no poster
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 40;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  roundRect(ctx, posterX, posterY, posterW, posterH, 28);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Título
  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 56px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  const title = `${movie.title}`;
  wrapText(ctx, title, STORY_W / 2, posterY + posterH + 90, STORY_W - 120, 64);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 36px system-ui, -apple-system, sans-serif";
  ctx.fillText(String(movie.year), STORY_W / 2, posterY + posterH + 170);

  // Badge de nota
  if (movie.rating != null && movie.rating > 0) {
    const badgeY = posterY + posterH + 260;
    roundRect(ctx, STORY_W / 2 - 220, badgeY - 70, 440, 140, 28);
    ctx.fillStyle = "rgba(245, 158, 11, 0.18)";
    ctx.fill();
    ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
    ctx.lineWidth = 3;
    roundRect(ctx, STORY_W / 2 - 220, badgeY - 70, 440, 140, 28);
    ctx.stroke();

    ctx.fillStyle = "#fbbf24";
    ctx.font = "800 72px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      `${formatMovieRating(movie.rating)}/10`,
      STORY_W / 2,
      badgeY + 10
    );
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "500 28px system-ui, -apple-system, sans-serif";
    ctx.fillText(getMovieRatingLabel(movie.rating), STORY_W / 2, badgeY + 55);
  }

  // Branding
  ctx.fillStyle = "#64748b";
  ctx.font = "600 28px system-ui, -apple-system, sans-serif";
  ctx.fillText("FinTrack", STORY_W / 2, STORY_H - 80);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

export function buildMovieShareText(movie: Movie): string {
  const parts = [`🎬 ${movie.title} (${movie.year})`];
  if (movie.rating != null && movie.rating > 0) {
    parts.push(
      `⭐ ${formatMovieRating(movie.rating)}/10 — ${getMovieRatingLabel(movie.rating)}`
    );
  }
  if (movie.notes?.trim()) {
    parts.push(`💬 ${movie.notes.trim()}`);
  }
  if (movie.would_recommend === false) {
    parts.push("👎 Não recomendaria");
  } else if (movie.status === "watched") {
    parts.push("👍 Recomendaria");
  }
  parts.push("via FinTrack");
  return parts.join("\n");
}

export async function shareMovieNative(
  movie: Movie,
  imageBlob: Blob | null
): Promise<"shared" | "copied" | "downloaded" | "cancelled"> {
  const text = buildMovieShareText(movie);
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

/**
 * Envia o banner + texto para o WhatsApp.
 * No celular: usa o menu nativo com a imagem (escolha o WhatsApp — o card vai junto).
 * No desktop: o wa.me não aceita anexo; baixa o banner e abre o WhatsApp com o texto.
 */
export async function shareMovieToWhatsApp(
  movie: Movie,
  imageBlob: Blob | null
): Promise<"shared" | "fallback" | "cancelled"> {
  const text = buildMovieShareText(movie);
  const file = toShareFile(movie, imageBlob);

  if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: movie.title,
        text,
        files: [file],
      });
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "cancelled";
      // Continua no fallback se o share com arquivo falhar
    }
  }

  if (imageBlob) {
    downloadBlob(imageBlob, shareFilename(movie));
  }
  openWhatsAppShare(movie);
  return "fallback";
}

export function openWhatsAppShare(movie: Movie) {
  const text = encodeURIComponent(buildMovieShareText(movie));
  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
}

export function downloadBlob(blob: Blob, filename: string) {
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
  return `${slugify(movie.title)}-fintrack.png`;
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
