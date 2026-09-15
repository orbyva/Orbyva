import type { Movie, MovieEpisode } from "@/types/movies";
import { formatMovieRating, getMovieRatingLabel } from "@/domain/movies";
import { fetchEpisodesForSeries } from "@/api/movieEpisodes";
import { BRAND_COLORS } from "@/lib/brand";
import {
  SHARE_BRAND,
  SHARE_H as STORY_H,
  SHARE_W as STORY_W,
  canvasToPngBlob,
  drawShareFooter,
  drawShareHeader,
  ensureShareBrandAssets,
  paintStoryBackdrop,
} from "@/lib/shareKit";

const BRAND = {
  name: SHARE_BRAND.name,
  tagline: SHARE_BRAND.tagline,
  primary: SHARE_BRAND.primary,
  primaryDeep: SHARE_BRAND.primaryDeep,
  primarySoft: SHARE_BRAND.primarySoft,
  cinema: BRAND_COLORS.cinema,
  ink: SHARE_BRAND.ink,
  paper: SHARE_BRAND.paper,
  muted: SHARE_BRAND.muted,
  gold: SHARE_BRAND.gold,
  font: SHARE_BRAND.font,
} as const;

export type RatedShareEpisode = {
  season: number;
  episode: number;
  title: string;
  rating: number;
};

/** Episódios com nota, na ordem da série. */
export function resolveRatedEpisodes(
  rows: MovieEpisode[]
): RatedShareEpisode[] {
  return rows
    .filter((e) => e.rating != null && e.rating > 0)
    .sort(
      (a, b) =>
        a.season_number - b.season_number ||
        a.episode_number - b.episode_number
    )
    .map((e) => ({
      season: e.season_number,
      episode: e.episode_number,
      title: e.episode_name?.trim() || `Episódio ${e.episode_number}`,
      rating: e.rating as number,
    }));
}

async function loadRatedEpisodes(movie: Movie): Promise<RatedShareEpisode[]> {
  if (movie.type !== "series") return [];
  try {
    const rows = await fetchEpisodesForSeries(movie.imdb_id);
    return resolveRatedEpisodes(rows);
  } catch {
    return [];
  }
}

/** Nota desc; empate → ordem da série. */
function sortEpisodesByRatingDesc(
  episodes: RatedShareEpisode[]
): RatedShareEpisode[] {
  return [...episodes].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (a.season !== b.season) return a.season - b.season;
    return a.episode - b.episode;
  });
}

/**
 * Se cabe tudo: ordem da série.
 * Se precisa cortar: melhores notas primeiro (empate na ordem da série).
 */
function pickEpisodesForShare(
  episodes: RatedShareEpisode[],
  limit: number
): RatedShareEpisode[] {
  if (episodes.length <= limit) return episodes;
  return sortEpisodesByRatingDesc(episodes).slice(0, limit);
}

function isTmdbImageHost(hostname: string): boolean {
  return (
    hostname === "image.tmdb.org" ||
    hostname === "www.themoviedb.org" ||
    hostname.endsWith(".tmdb.org")
  );
}

/**
 * TMDB (e alguns CDNs) quebram canvas com CORS/`crossOrigin`.
 * Preferimos same-origin proxy + blob URL (não tainta o canvas).
 */
function toShareableImageUrl(src: string): string {
  try {
    const u = new URL(src, window.location.origin);
    if (isTmdbImageHost(u.hostname)) {
      // w500 → w780 no share (capa mais nítida)
      const path = u.pathname.replace(/\/t\/p\/w\d+\//, "/t/p/w780/");
      return `/tmdb-media${path}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return src;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  const candidates = [toShareableImageUrl(src)];
  if (candidates[0] !== src) candidates.push(src);

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) continue;
      const objectUrl = URL.createObjectURL(blob);
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => resolve(null);
        el.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);
      if (img) return img;
    } catch {
      /* tenta próximo */
    }
  }

  // Último recurso: <img crossOrigin> (OMDB / hosts com ACAO)
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
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

function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number
): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) {
    t = t.slice(0, -1);
  }
  return t.length ? `${t}…` : "…";
}

/**
 * Joinha outline (path Lucide), leve e alinhado ao resto do card.
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

/**
 * Episódios avaliados: 1–2 colunas, margem simétrica.
 * Se couber tudo → ordem da série; se cortar → melhores notas primeiro.
 */
function drawRatedEpisodesBlock(
  ctx: CanvasRenderingContext2D,
  episodes: RatedShareEpisode[],
  startY: number,
  maxY: number
): number {
  if (!episodes.length || maxY - startY < 80) return startY;

  const sidePad = 88;
  const gapX = 40;
  const usableW = STORY_W - sidePad * 2;
  const available = maxY - startY;

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(248, 250, 252, 0.55)";
  ctx.font = `700 22px ${BRAND.font}`;
  ctx.fillText("EPISÓDIOS", STORY_W / 2, startY);

  const headerH = 40;
  const bodyTop = startY + headerH;
  const bodyH = available - headerH;
  if (bodyH < 48) return startY;

  const cols = episodes.length >= 5 ? 2 : 1;
  const minRow = cols === 1 ? 44 : 40;
  const maxRowsFit = Math.max(1, Math.floor(bodyH / minRow));
  const maxItems = maxRowsFit * cols;
  const shown = pickEpisodesForShare(episodes, maxItems);
  const rows = Math.ceil(shown.length / cols);
  const rowH = Math.min(64, Math.max(minRow, bodyH / rows));
  const colW = cols === 1 ? usableW : (usableW - gapX) / 2;
  const originX = sidePad;

  const scoreFont = `800 ${cols === 1 ? 22 : 18}px ${BRAND.font}`;
  const titleFont = `600 ${cols === 1 ? 24 : 20}px ${BRAND.font}`;
  const indexFont = `600 ${cols === 1 ? 20 : 17}px ${BRAND.font}`;
  const pillH = cols === 1 ? 34 : 30;
  const pillW = cols === 1 ? 78 : 68;
  const indexW = cols === 1 ? 88 : 72;
  const titleMaxW = colW - indexW - pillW - 20;

  ctx.textBaseline = "middle";

  shown.forEach((ep, i) => {
    const col = cols === 1 ? 0 : Math.floor(i / rows);
    const row = cols === 1 ? i : i % rows;
    const x = originX + col * (colW + gapX);
    const cy = bodyTop + row * rowH + rowH / 2;
    const indexLabel = `S${ep.season}E${ep.episode}`;
    const scoreLabel = formatMovieRating(ep.rating);

    ctx.textAlign = "right";
    ctx.font = indexFont;
    ctx.fillStyle = "rgba(248, 250, 252, 0.45)";
    ctx.fillText(indexLabel, x + indexW - 8, cy + 1);

    ctx.textAlign = "left";
    ctx.font = titleFont;
    ctx.fillStyle = BRAND.paper;
    ctx.fillText(ellipsize(ctx, ep.title, titleMaxW), x + indexW, cy + 1);

    const pillX = x + colW - pillW;
    const pillY = cy - pillH / 2;
    ctx.fillStyle = "rgba(251, 191, 36, 0.18)";
    ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
    ctx.lineWidth = 2;
    roundRect(ctx, pillX, pillY, pillW, pillH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.font = scoreFont;
    ctx.fillStyle = BRAND.gold;
    ctx.fillText(scoreLabel, pillX + pillW / 2, cy + 1);
  });

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";

  if (episodes.length > shown.length) {
    const moreY = bodyTop + rows * rowH + 8;
    if (moreY < maxY - 8) {
      ctx.fillStyle = "rgba(248, 250, 252, 0.45)";
      ctx.font = `600 20px ${BRAND.font}`;
      ctx.fillText(
        `+${episodes.length - shown.length} episódios`,
        STORY_W / 2,
        moreY
      );
    }
  }

  return bodyTop + rows * rowH + (episodes.length > shown.length ? 28 : 8);
}

/**
 * Card Stories com identidade visual do produto:
 * pôster em atmosfera + tipografia + marca.
 */
export async function generateMovieShareImage(
  movie: Movie,
  options: { includeNotes?: boolean } = {}
): Promise<Blob | null> {
  await ensureShareBrandAssets();
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const includeNotes = options.includeNotes !== false;
  const notes = includeNotes ? movie.notes?.trim() : "";
  const ratedEpisodes = await loadRatedEpisodes(movie);
  const hasEpisodes = ratedEpisodes.length > 0;

  const posterUrl = movie.poster && movie.poster !== "N/A" ? movie.poster : null;
  const poster = posterUrl ? await loadImage(posterUrl) : null;

  paintStoryBackdrop(ctx, { photo: poster });
  drawShareHeader(ctx, "Minha opinião");

  // ── Pôster principal (menor quando há episódios avaliados) ─────────
  const posterW = hasEpisodes ? (notes ? 360 : 420) : 680;
  const posterH = hasEpisodes ? (notes ? 540 : 630) : 1020;
  const posterX = (STORY_W - posterW) / 2;
  const posterY = hasEpisodes ? 200 : 220;
  const radius = hasEpisodes ? 28 : 36;

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
  let cursorY = posterY + posterH + (hasEpisodes ? 48 : 88);

  // Tipo + ano
  const meta = [
    movie.type === "series" ? "SÉRIE" : "FILME",
    String(movie.year),
  ].join("  ·  ");
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(248, 250, 252, 0.7)";
  ctx.font = `600 ${hasEpisodes ? 22 : 26}px ${BRAND.font}`;
  ctx.fillText(meta, STORY_W / 2, cursorY);
  cursorY += hasEpisodes ? 44 : 62;

  // Título
  ctx.fillStyle = BRAND.paper;
  ctx.font = `800 ${hasEpisodes ? 46 : 58}px ${BRAND.font}`;
  cursorY = wrapText(
    ctx,
    movie.title,
    STORY_W / 2,
    cursorY,
    STORY_W - 140,
    hasEpisodes ? 52 : 68,
    hasEpisodes ? 2 : 3
  );
  cursorY += hasEpisodes ? 28 : 54;

  // Nota em pill de produto
  if (movie.rating != null && movie.rating > 0) {
    const score = `${formatMovieRating(movie.rating)}`;
    const label = getMovieRatingLabel(movie.rating);
    const pillW = hasEpisodes ? 400 : 480;
    const pillH = hasEpisodes ? 108 : 132;
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

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = BRAND.paper;
    ctx.font = `800 ${hasEpisodes ? 48 : 58}px ${BRAND.font}`;
    ctx.fillText(
      `${score}/10`,
      STORY_W / 2,
      pillCy - (hasEpisodes ? 14 : 18)
    );

    ctx.fillStyle = "rgba(248, 250, 252, 0.82)";
    ctx.font = `600 ${hasEpisodes ? 20 : 24}px ${BRAND.font}`;
    ctx.fillText(
      label.toUpperCase(),
      STORY_W / 2,
      pillCy + (hasEpisodes ? 22 : 28)
    );
    ctx.textBaseline = "alphabetic";

    cursorY = pillY + pillH + (hasEpisodes ? 28 : 48);
  }

  // Recomendação, chip + ícone, conteúdo centrado no chip
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

    cursorY = chipY + chipH + (hasEpisodes ? 28 : 40);
  }

  const footerTop = STORY_H - 180;

  if (hasEpisodes) {
    const notesReserve = notes ? 90 : 16;
    cursorY =
      drawRatedEpisodesBlock(
        ctx,
        ratedEpisodes,
        cursorY,
        footerTop - notesReserve
      ) + 16;
  }

  // Nota escrita (curta), controlada por includeNotes
  if (notes) {
    ctx.fillStyle = "rgba(248, 250, 252, 0.55)";
    ctx.font = `500 26px ${BRAND.font}`;
    wrapText(
      ctx,
      `“${notes}”`,
      STORY_W / 2,
      Math.min(cursorY + 8, footerTop - 70),
      STORY_W - 160,
      36,
      2
    );
  }

  // ── Footer de marca ────────────────────────────────────────────────
  drawShareFooter(ctx);

  return canvasToPngBlob(canvas);
}

export function buildMovieShareText(
  movie: Movie,
  options: {
    includeNotes?: boolean;
    ratedEpisodes?: RatedShareEpisode[];
  } = {}
): string {
  const includeNotes = options.includeNotes !== false;
  const parts = [`🎬 ${movie.title} (${movie.year})`];
  if (movie.rating != null && movie.rating > 0) {
    parts.push(
      `⭐ ${formatMovieRating(movie.rating)}/10 · ${getMovieRatingLabel(movie.rating)}`
    );
  }
  if (includeNotes && movie.notes?.trim()) {
    parts.push(`💬 ${movie.notes.trim()}`);
  }
  const rated = options.ratedEpisodes ?? [];
  if (rated.length) {
    parts.push("Episódios:");
    const shown = pickEpisodesForShare(rated, 12);
    for (const e of shown) {
      parts.push(
        `• S${e.season}E${e.episode} ${e.title}, ${formatMovieRating(e.rating)}/10`
      );
    }
    if (rated.length > shown.length) {
      parts.push(`• +${rated.length - shown.length} episódios`);
    }
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
  const ratedEpisodes = await loadRatedEpisodes(movie);
  const text = buildMovieShareText(movie, { ...options, ratedEpisodes });
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
