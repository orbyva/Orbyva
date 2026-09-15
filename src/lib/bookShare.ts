import type { Book } from "@/types/books";
import {
  formatAuthors,
  formatBookRating,
  getBookRatingLabel,
  getLatestReadDate,
} from "@/domain/books";
import { formatDateBR } from "@/lib/currency";
import {
  SHARE_BRAND,
  SHARE_W,
  STORY_HERO_ILLUSTRATED,
  canvasToPngBlob,
  createShareCanvas,
  drawRecommendChip,
  drawScorePill,
  drawShareFooter,
  drawStoryHeader,
  drawStoryHeroCard,
  ensureShareBrandAssets,
  paintStoryBackdrop,
  shareNativePayload,
  slugify,
  wrapShareText,
} from "@/lib/shareKit";

export type BookShareOptions = {
  includeNotes?: boolean;
};

function isGoogleBooksCoverHost(hostname: string): boolean {
  return (
    hostname === "books.google.com" ||
    hostname === "www.books.google.com" ||
    hostname.endsWith(".googleusercontent.com")
  );
}

/**
 * Capas do Google Books quebram canvas com CORS.
 * Same-origin proxy + blob URL (igual ao TMDB no cinema).
 */
function toShareableCoverUrl(src: string): string {
  try {
    const u = new URL(src, window.location.origin);
    if (!isGoogleBooksCoverHost(u.hostname)) return src;

    // Zoom maior + sem “edge=curl” (capa mais limpa no Stories)
    if (u.searchParams.has("zoom")) u.searchParams.set("zoom", "3");
    u.searchParams.delete("edge");

    if (
      u.hostname === "books.google.com" ||
      u.hostname === "www.books.google.com"
    ) {
      return `/books-media${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }
  return src;
}

async function loadCoverImage(src: string): Promise<HTMLImageElement | null> {
  const candidates = [toShareableCoverUrl(src)];
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

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
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
  ctx.save();
  ctx.beginPath();
  const r = 28;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

/**
 * Card Stories, capa + nota / recomendação (padrão cinema/lugares).
 */
export async function generateBookShareImage(
  book: Book,
  options: BookShareOptions = {}
): Promise<Blob | null> {
  await ensureShareBrandAssets();
  const { canvas, ctx } = createShareCanvas();
  const includeNotes = options.includeNotes !== false;
  const notes = includeNotes ? book.notes?.trim() : "";
  const cover = book.cover_url ? await loadCoverImage(book.cover_url) : null;
  const latest = getLatestReadDate(book.read_dates);

  paintStoryBackdrop(ctx, { photo: cover });

  drawStoryHeader(ctx, "Minha opinião");

  let cursorY: number;
  const centerX = SHARE_W / 2;

  if (cover) {
    const heroW = 520;
    const heroH = 780;
    const heroY = 200;
    const heroX = (SHARE_W - heroW) / 2;
    drawCover(ctx, cover, heroX, heroY, heroW, heroH);
    cursorY = heroY + heroH + 72;
  } else {
    const hero = STORY_HERO_ILLUSTRATED;
    const heroX = (SHARE_W - hero.w) / 2;
    drawStoryHeroCard(ctx, {
      emoji: "📖",
      caption: "LIVRO",
      x: heroX,
      y: hero.y,
      w: hero.w,
      h: hero.h,
      radius: hero.radius,
    });
    cursorY = hero.y + hero.h + 72;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(248, 250, 252, 0.7)";
  ctx.font = `600 26px ${SHARE_BRAND.font}`;
  ctx.fillText(
    latest ? `LIDO  ·  ${formatDateBR(latest)}` : "LIDO",
    centerX,
    cursorY
  );
  cursorY += 62;

  ctx.fillStyle = SHARE_BRAND.paper;
  ctx.font = `800 54px ${SHARE_BRAND.font}`;
  cursorY = wrapShareText(
    ctx,
    book.title,
    centerX,
    cursorY,
    SHARE_W - 140,
    62,
    3
  );
  cursorY += 36;

  ctx.fillStyle = "rgba(248, 250, 252, 0.75)";
  ctx.font = `600 28px ${SHARE_BRAND.font}`;
  cursorY = wrapShareText(
    ctx,
    formatAuthors(book.authors),
    centerX,
    cursorY,
    SHARE_W - 160,
    36,
    2
  );
  cursorY += 48;

  if (book.rating != null && book.rating > 0) {
    cursorY =
      drawScorePill(ctx, {
        score: `${formatBookRating(book.rating)}/10`,
        label: getBookRatingLabel(book.rating),
        topY: cursorY,
      }) + 48;
  }

  cursorY =
    drawRecommendChip(ctx, book.would_recommend !== false, cursorY) + 40;

  if (notes) {
    ctx.fillStyle = "rgba(248, 250, 252, 0.55)";
    ctx.font = `500 26px ${SHARE_BRAND.font}`;
    wrapShareText(
      ctx,
      `“${notes}”`,
      centerX,
      cursorY + 8,
      SHARE_W - 160,
      36,
      2
    );
  }

  drawShareFooter(ctx);
  return canvasToPngBlob(canvas);
}

export function buildBookShareText(
  book: Book,
  options: { includeNotes?: boolean } = {}
): string {
  const includeNotes = options.includeNotes !== false;
  const parts = [`📖 ${book.title}`];
  if (book.authors.length) {
    parts.push(formatAuthors(book.authors));
  }
  if (book.rating != null && book.rating > 0) {
    parts.push(
      `Nota ${formatBookRating(book.rating)}/10 · ${getBookRatingLabel(book.rating)}`
    );
  }
  if (includeNotes && book.notes?.trim()) {
    parts.push(`💬 ${book.notes.trim()}`);
  }
  parts.push(
    book.would_recommend !== false ? "👍 Recomendaria" : "👎 Não recomendaria"
  );
  parts.push(`via ${SHARE_BRAND.name}`);
  return parts.join("\n");
}

export async function shareBookNative(
  book: Book,
  imageBlob: Blob | null,
  options: { includeNotes?: boolean } = {}
) {
  return shareNativePayload({
    title: book.title,
    text: buildBookShareText(book, options),
    filename: `${slugify(book.title)}-livro.png`,
    imageBlob,
  });
}
