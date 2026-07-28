import type { PlaceVisit } from "@/types/places";
import {
  PLACE_TYPE_EMOJI,
  PLACE_TYPE_LABELS,
  formatRating,
  getRatingLabel,
} from "@/domain/places";
import { formatBRL, formatDateBR } from "@/lib/currency";
import {
  SHARE_BRAND,
  SHARE_W,
  STORY_HERO_ILLUSTRATED,
  canvasToPngBlob,
  createShareCanvas,
  drawPhotoMosaic,
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

export type PlaceShareOptions = {
  /** @deprecated use photos */
  photo?: HTMLImageElement | null;
  photos?: HTMLImageElement[];
  /** Foto do blur de fundo (padrão: primeira do mosaico). */
  backdropPhoto?: HTMLImageElement | null;
  /** Inclui o comentário escrito no card (padrão: true). */
  includeNotes?: boolean;
};

/**
 * Card Stories no padrão cinema: mosaico opcional + nota / recomendação.
 */
export async function generatePlaceShareImage(
  place: PlaceVisit,
  options: PlaceShareOptions = {}
): Promise<Blob | null> {
  await ensureShareBrandAssets();
  const { canvas, ctx } = createShareCanvas();
  const photos = (
    options.photos?.length
      ? options.photos
      : options.photo
        ? [options.photo]
        : []
  ).filter(Boolean);
  const includeNotes = options.includeNotes !== false;
  const notes = includeNotes ? place.notes?.trim() : "";

  paintStoryBackdrop(ctx, {
    photo: options.backdropPhoto ?? photos[0] ?? null,
    washFrom: "rgba(14, 165, 233, 0.48)",
    washTo: "rgba(2, 132, 199, 0.28)",
  });

  drawStoryHeader(ctx, "Minha opinião");

  let cursorY: number;
  const centerX = SHARE_W / 2;

  if (photos.length > 0) {
    const heroW = 680;
    // 1 foto: frame mais alto; mosaico: um pouco mais baixo pra caber a opinião
    const heroH =
      photos.length === 1 ? 780 : photos.length >= 3 ? 560 : 520;
    const heroY = 200;
    const heroX = (SHARE_W - heroW) / 2;
    drawPhotoMosaic(ctx, photos, heroX, heroY, heroW, heroH);
    cursorY = heroY + heroH + 72;
  } else {
    const hero = STORY_HERO_ILLUSTRATED;
    const heroX = (SHARE_W - hero.w) / 2;
    drawStoryHeroCard(ctx, {
      emoji: PLACE_TYPE_EMOJI[place.type] ?? "📍",
      caption: (PLACE_TYPE_LABELS[place.type] ?? place.type).toUpperCase(),
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
    `${(PLACE_TYPE_LABELS[place.type] ?? place.type).toUpperCase()}  ·  ${
      place.status === "to_visit"
        ? "PARA VISITAR"
        : formatDateBR(place.visited_date)
    }`,
    centerX,
    cursorY
  );
  cursorY += 62;

  ctx.fillStyle = SHARE_BRAND.paper;
  ctx.font = `800 58px ${SHARE_BRAND.font}`;
  cursorY = wrapShareText(
    ctx,
    place.name,
    centerX,
    cursorY,
    SHARE_W - 140,
    68,
    3
  );
  cursorY += 54;

  if (place.rating != null && place.rating > 0) {
    cursorY =
      drawScorePill(ctx, {
        score: `${formatRating(place.rating)}/5`,
        label: getRatingLabel(place.rating),
        topY: cursorY,
      }) + 48;
  }

  cursorY =
    drawRecommendChip(ctx, place.would_recommend !== false, cursorY) + 40;

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

export function buildPlaceShareText(
  place: PlaceVisit,
  options: { includeNotes?: boolean } = {}
): string {
  const includeNotes = options.includeNotes !== false;
  const parts = [`📍 ${place.name}`];
  if (place.rating != null && place.rating > 0) {
    parts.push(
      `Nota ${formatRating(place.rating)}/5 · ${getRatingLabel(place.rating)}`
    );
  }
  if (place.amount != null && place.amount > 0) {
    parts.push(`💰 ${formatBRL(place.amount)}`);
  }
  if (includeNotes && place.notes?.trim()) {
    parts.push(`💬 ${place.notes.trim()}`);
  }
  parts.push(
    place.would_recommend !== false ? "👍 Recomendaria" : "👎 Não recomendaria"
  );
  parts.push(`via ${SHARE_BRAND.name}`);
  return parts.join("\n");
}

export async function sharePlaceNative(
  place: PlaceVisit,
  imageBlob: Blob | null,
  options: { includeNotes?: boolean } = {}
) {
  return shareNativePayload({
    title: place.name,
    text: buildPlaceShareText(place, options),
    filename: `${slugify(place.name)}-lugar.png`,
    imageBlob,
  });
}
