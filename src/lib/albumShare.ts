import type { Album } from "@/types/music";
import {
  formatAlbumRating,
  formatArtists,
  getAlbumRatingLabel,
  getLatestListenedDate,
  resolveRatedAlbumTracks,
  type RatedAlbumTrack,
} from "@/domain/music";
import { formatDateBR } from "@/lib/currency";
import { fetchCatalogTracklist } from "@/lib/musicCatalog";
import { toProxiedSpotifyCover } from "@/lib/spotify";
import {
  SHARE_BRAND,
  SHARE_H,
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

export type AlbumShareOptions = {
  includeNotes?: boolean;
};

function toShareableCoverUrl(src: string): string {
  try {
    const u = new URL(src, window.location.origin);
    if (
      u.pathname.startsWith("/caa-media") ||
      u.hostname === "coverartarchive.org" ||
      u.hostname.endsWith(".archive.org")
    ) {
      if (u.hostname === "coverartarchive.org") {
        return `/caa-media${u.pathname}${u.search}`;
      }
      if (u.pathname.startsWith("/caa-media")) return `${u.pathname}${u.search}`;
    }
    if (
      u.pathname.startsWith("/spotify-media") ||
      u.hostname === "i.scdn.co" ||
      u.hostname.endsWith(".scdn.co")
    ) {
      const proxied = toProxiedSpotifyCover(src);
      if (proxied) return proxied;
      if (u.pathname.startsWith("/spotify-media")) {
        return `${u.pathname}${u.search}`;
      }
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
      /* next */
    }
  }
  return null;
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

async function loadRatedTracks(album: Album): Promise<RatedAlbumTrack[]> {
  const ratings = album.track_ratings ?? {};
  if (!Object.keys(ratings).length) return [];
  if (album.musicbrainz_id.startsWith("manual_")) return [];
  if (album.source !== "spotify" && album.source !== "musicbrainz") {
    return [];
  }
  try {
    const tracks = await fetchCatalogTracklist(
      album.musicbrainz_id,
      album.source,
      album.title
    );
    return resolveRatedAlbumTracks(ratings, tracks);
  } catch {
    return [];
  }
}

function ellipsizeShareText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number
): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let title = text;
  while (title.length > 1 && ctx.measureText(`${title}…`).width > maxW) {
    title = title.slice(0, -1);
  }
  return title.length ? `${title}…` : "…";
}

/**
 * Desenha faixas avaliadas no espaço entre `startY` e `maxY`.
 * Ordem do álbum, em colunas (1..n à esquerda, n+1.. à direita),
 * com margem simétrica e nota à direita de cada linha.
 */
function drawRatedTracksBlock(
  ctx: CanvasRenderingContext2D,
  tracks: RatedAlbumTrack[],
  startY: number,
  maxY: number
): number {
  if (!tracks.length || maxY - startY < 80) return startY;

  const sidePad = 88;
  const gapX = 40;
  const usableW = SHARE_W - sidePad * 2;
  const available = maxY - startY;

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(248, 250, 252, 0.55)";
  ctx.font = `700 22px ${SHARE_BRAND.font}`;
  ctx.fillText("FAIXAS", SHARE_W / 2, startY);

  const headerH = 40;
  const bodyTop = startY + headerH;
  const bodyH = available - headerH;
  if (bodyH < 48) return startY;

  const cols = tracks.length >= 5 ? 2 : 1;
  const minRow = cols === 1 ? 44 : 40;
  const maxRowsFit = Math.max(1, Math.floor(bodyH / minRow));
  const maxItems = maxRowsFit * cols;
  const shown = tracks.slice(0, maxItems);
  const rows = Math.ceil(shown.length / cols);
  const rowH = Math.min(64, Math.max(minRow, bodyH / rows));

  const colW = cols === 1 ? usableW : (usableW - gapX) / 2;
  // Larguras iguais + margem simétrica → vão exatamente no meio da arte.
  const originX = sidePad;

  const scoreFont = `800 ${cols === 1 ? 22 : 18}px ${SHARE_BRAND.font}`;
  const titleFont = `600 ${cols === 1 ? 26 : 22}px ${SHARE_BRAND.font}`;
  const indexFont = `600 ${cols === 1 ? 22 : 18}px ${SHARE_BRAND.font}`;
  const pillH = cols === 1 ? 34 : 30;
  const pillW = cols === 1 ? 78 : 68;
  const indexW = cols === 1 ? 44 : 36;
  const titleMaxW = colW - indexW - pillW - 20;

  ctx.textBaseline = "middle";

  shown.forEach((track, i) => {
    // Coluna a coluna: 1..rows | rows+1..
    const col = cols === 1 ? 0 : Math.floor(i / rows);
    const row = cols === 1 ? i : i % rows;
    const x = originX + col * (colW + gapX);
    const cy = bodyTop + row * rowH + rowH / 2;

    const indexLabel =
      track.disc > 1
        ? `${track.disc}.${track.position}`
        : String(track.position);
    const scoreLabel = formatAlbumRating(track.rating);

    ctx.textAlign = "right";
    ctx.font = indexFont;
    ctx.fillStyle = "rgba(248, 250, 252, 0.45)";
    ctx.fillText(indexLabel, x + indexW - 8, cy + 1);

    ctx.textAlign = "left";
    ctx.font = titleFont;
    ctx.fillStyle = SHARE_BRAND.paper;
    ctx.fillText(
      ellipsizeShareText(ctx, track.title, titleMaxW),
      x + indexW,
      cy + 1
    );

    const pillX = x + colW - pillW;
    const pillY = cy - pillH / 2;
    ctx.fillStyle = "rgba(251, 191, 36, 0.18)";
    ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
    ctx.lineWidth = 2;
    roundRectPath(ctx, pillX, pillY, pillW, pillH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.font = scoreFont;
    ctx.fillStyle = SHARE_BRAND.gold;
    ctx.fillText(scoreLabel, pillX + pillW / 2, cy + 1);
  });

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";

  if (tracks.length > shown.length) {
    const moreY = bodyTop + rows * rowH + 8;
    if (moreY < maxY - 8) {
      ctx.fillStyle = "rgba(248, 250, 252, 0.45)";
      ctx.font = `600 20px ${SHARE_BRAND.font}`;
      ctx.fillText(`+${tracks.length - shown.length} faixas`, SHARE_W / 2, moreY);
    }
  }

  return bodyTop + rows * rowH + (tracks.length > shown.length ? 28 : 8);
}

function roundRectPath(
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

export async function generateAlbumShareImage(
  album: Album,
  options: AlbumShareOptions = {}
): Promise<Blob | null> {
  await ensureShareBrandAssets();
  const { canvas, ctx } = createShareCanvas();
  const includeNotes = options.includeNotes !== false;
  const notes = includeNotes ? album.notes?.trim() : "";
  const cover = album.cover_url ? await loadCoverImage(album.cover_url) : null;
  const latest = getLatestListenedDate(album.listened_dates);
  const ratedTracks = await loadRatedTracks(album);
  const hasTracks = ratedTracks.length > 0;

  paintStoryBackdrop(ctx, {
    photo: cover,
    washFrom: "rgba(14, 165, 233, 0.48)",
    washTo: "rgba(2, 132, 199, 0.28)",
  });

  drawStoryHeader(ctx, "Minha opinião");

  let cursorY: number;
  const centerX = SHARE_W / 2;
  // Capa menor quando há faixas — libera espaço sem apertar o layout.
  const heroSize = hasTracks ? (notes ? 420 : 480) : 680;

  if (cover) {
    const heroY = hasTracks ? 200 : 220;
    const heroX = (SHARE_W - heroSize) / 2;
    drawCover(ctx, cover, heroX, heroY, heroSize, heroSize);
    cursorY = heroY + heroSize + (hasTracks ? 48 : 72);
  } else {
    const hero = STORY_HERO_ILLUSTRATED;
    const heroX = (SHARE_W - hero.w) / 2;
    drawStoryHeroCard(ctx, {
      emoji: "💿",
      caption: "ÁLBUM",
      x: heroX,
      y: hero.y,
      w: hero.w,
      h: hasTracks ? Math.min(hero.h, 420) : hero.h,
      radius: hero.radius,
    });
    cursorY = hero.y + (hasTracks ? Math.min(hero.h, 420) : hero.h) + 56;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(248, 250, 252, 0.7)";
  ctx.font = `600 26px ${SHARE_BRAND.font}`;
  ctx.fillText(
    latest ? `OUVI  ·  ${formatDateBR(latest)}` : "OUVI",
    centerX,
    cursorY
  );
  cursorY += hasTracks ? 48 : 62;

  ctx.fillStyle = SHARE_BRAND.paper;
  ctx.font = `800 ${hasTracks ? 46 : 54}px ${SHARE_BRAND.font}`;
  cursorY = wrapShareText(
    ctx,
    album.title,
    centerX,
    cursorY,
    SHARE_W - 140,
    hasTracks ? 52 : 62,
    hasTracks ? 2 : 3
  );
  cursorY += hasTracks ? 24 : 36;

  ctx.fillStyle = "rgba(248, 250, 252, 0.75)";
  ctx.font = `600 ${hasTracks ? 24 : 28}px ${SHARE_BRAND.font}`;
  cursorY = wrapShareText(
    ctx,
    formatArtists(album.artists),
    centerX,
    cursorY,
    SHARE_W - 160,
    hasTracks ? 32 : 36,
    2
  );
  cursorY += hasTracks ? 32 : 48;

  if (album.rating != null && album.rating > 0) {
    cursorY =
      drawScorePill(ctx, {
        score: `${formatAlbumRating(album.rating)}/10`,
        label: getAlbumRatingLabel(album.rating),
        topY: cursorY,
      }) + (hasTracks ? 28 : 48);
  }

  cursorY =
    drawRecommendChip(ctx, album.would_recommend !== false, cursorY) +
    (hasTracks ? 28 : 40);

  const footerTop = SHARE_H - 180;
  let tracksBottom = cursorY;

  if (hasTracks) {
    // Reserva faixa para notas curtas, se houver.
    const notesReserve = notes ? 90 : 16;
    const tracksMaxY = footerTop - notesReserve;
    tracksBottom = drawRatedTracksBlock(
      ctx,
      ratedTracks,
      cursorY,
      tracksMaxY
    );
    cursorY = tracksBottom + 16;
  }

  if (notes) {
    ctx.fillStyle = "rgba(248, 250, 252, 0.55)";
    ctx.font = `500 26px ${SHARE_BRAND.font}`;
    wrapShareText(
      ctx,
      `“${notes}”`,
      centerX,
      Math.min(cursorY + 8, footerTop - 70),
      SHARE_W - 160,
      36,
      hasTracks ? 2 : 3
    );
  }

  drawShareFooter(ctx);
  return canvasToPngBlob(canvas);
}

export function buildAlbumShareText(
  album: Album,
  options: { includeNotes?: boolean; ratedTracks?: RatedAlbumTrack[] } = {}
): string {
  const includeNotes = options.includeNotes !== false;
  const parts = [`💿 ${album.title}`];
  if (album.artists.length) parts.push(formatArtists(album.artists));
  if (album.rating != null && album.rating > 0) {
    parts.push(
      `Nota ${formatAlbumRating(album.rating)}/10 · ${getAlbumRatingLabel(album.rating)}`
    );
  }
  if (includeNotes && album.notes?.trim()) {
    parts.push(`💬 ${album.notes.trim()}`);
  }
  const rated = options.ratedTracks ?? [];
  if (rated.length) {
    parts.push("Faixas:");
    for (const t of rated.slice(0, 12)) {
      const idx = t.disc > 1 ? `${t.disc}.${t.position}` : t.position;
      parts.push(
        `• ${idx}. ${t.title} — ${formatAlbumRating(t.rating)}/10`
      );
    }
    if (rated.length > 12) {
      parts.push(`• +${rated.length - 12} faixas`);
    }
  }
  parts.push(
    album.would_recommend !== false ? "👍 Recomendaria" : "👎 Não recomendaria"
  );
  parts.push(`via ${SHARE_BRAND.name}`);
  return parts.join("\n");
}

export async function shareAlbumNative(
  album: Album,
  imageBlob: Blob | null,
  options: { includeNotes?: boolean } = {}
) {
  const ratedTracks = await loadRatedTracks(album);
  return shareNativePayload({
    title: album.title,
    text: buildAlbumShareText(album, { ...options, ratedTracks }),
    filename: `${slugify(album.title)}-album.png`,
    imageBlob,
  });
}
