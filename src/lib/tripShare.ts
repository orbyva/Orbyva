import type { Trip } from "@/types/travel";
import type { PlaceVisit } from "@/types/places";
import { PLACE_TYPE_EMOJI, formatRating } from "@/domain/places";
import { formatDateBR } from "@/lib/currency";
import {
  SHARE_BRAND,
  SHARE_H,
  SHARE_W,
  canvasToPngBlob,
  createShareCanvas,
  drawPhotoMosaic,
  drawShareFooter,
  drawStoryHeader,
  drawStoryHeroCard,
  ensureShareBrandAssets,
  paintStoryBackdrop,
  roundSharePath,
  shareNativePayload,
  slugify,
  wrapShareText,
} from "@/lib/shareKit";

export type TripShareOptions = {
  /** @deprecated use photos */
  photo?: HTMLImageElement | null;
  photos?: HTMLImageElement[];
  /** Foto do blur de fundo (padrão: primeira do mosaico). */
  backdropPhoto?: HTMLImageElement | null;
  places?: PlaceVisit[];
};

const FOOTER_TOP = SHARE_H - 160;

/**
 * Card Stories da viagem: mosaico de fotos + lista de lugares com notas.
 * Sem orçamento / gasto.
 */
export async function generateTripShareImage(
  trip: Trip,
  options: TripShareOptions = {}
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
  const places = [...(options.places ?? [])].sort((a, b) => {
    const ra = a.rating ?? 0;
    const rb = b.rating ?? 0;
    if (rb !== ra) return rb - ra;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  paintStoryBackdrop(ctx, {
    photo: options.backdropPhoto ?? photos[0] ?? null,
    washFrom: "rgba(14, 165, 233, 0.48)",
    washTo: "rgba(2, 132, 199, 0.28)",
  });

  drawStoryHeader(ctx, "Minha viagem");

  let cursorY = 200;
  const centerX = SHARE_W / 2;

  if (photos.length > 0) {
    const heroW = 680;
    // Com 3–4 fotos o mosaico ganha um pouco mais de altura
    const heroH = photos.length >= 3 ? 560 : 520;
    const heroX = (SHARE_W - heroW) / 2;
    drawPhotoMosaic(ctx, photos, heroX, cursorY, heroW, heroH);
    cursorY += heroH + 56;
  } else {
    const badge = 160;
    const badgeX = (SHARE_W - badge) / 2;
    drawStoryHeroCard(ctx, {
      emoji: "✈️",
      x: badgeX,
      y: cursorY,
      w: badge,
      h: badge,
      radius: 36,
    });
    cursorY += badge + 48;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(248, 250, 252, 0.7)";
  ctx.font = `600 24px ${SHARE_BRAND.font}`;
  const dateRange = `${formatDateBR(trip.start_date)} → ${formatDateBR(trip.end_date)}`;
  const meta = trip.destination
    ? `${trip.destination.toUpperCase()}  ·  ${dateRange}`
    : dateRange;

  if (ctx.measureText(meta).width > SHARE_W - 140 && trip.destination) {
    ctx.fillText(trip.destination.toUpperCase(), centerX, cursorY);
    cursorY += 36;
    ctx.fillText(dateRange, centerX, cursorY);
    cursorY += 52;
  } else {
    ctx.fillText(meta, centerX, cursorY);
    cursorY += 52;
  }

  ctx.fillStyle = SHARE_BRAND.paper;
  ctx.font = `800 52px ${SHARE_BRAND.font}`;
  cursorY = wrapShareText(
    ctx,
    trip.title,
    centerX,
    cursorY,
    SHARE_W - 140,
    60,
    2
  );
  cursorY += 40;

  // Lista de lugares
  const listX = 72;
  const listW = SHARE_W - 144;
  const rowH = 72;

  if (places.length === 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(248, 250, 252, 0.45)";
    ctx.font = `500 26px ${SHARE_BRAND.font}`;
    ctx.fillText("Nenhum lugar registrado nesta viagem", centerX, cursorY + 24);
  } else {
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(248, 250, 252, 0.55)";
    ctx.font = `600 22px ${SHARE_BRAND.font}`;
    ctx.fillText(
      `LUGARES  ·  ${places.length}`,
      listX,
      cursorY
    );
    cursorY += 28;

    let shown = 0;
    for (const place of places) {
      if (cursorY + rowH > FOOTER_TOP) break;

      roundSharePath(ctx, listX, cursorY, listW, rowH - 10, 20);
      ctx.fillStyle = "rgba(248, 250, 252, 0.08)";
      ctx.fill();
      roundSharePath(ctx, listX, cursorY, listW, rowH - 10, 20);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const rowCy = cursorY + (rowH - 10) / 2;
      const emoji = PLACE_TYPE_EMOJI[place.type] ?? "📍";

      ctx.font =
        '36px "Apple Color Emoji", "Segoe UI Emoji", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, listX + 44, rowCy + 2);

      ctx.textAlign = "left";
      ctx.fillStyle = SHARE_BRAND.paper;
      ctx.font = `700 28px ${SHARE_BRAND.font}`;
      const nameMax = listW - (place.rating != null && place.rating > 0 ? 220 : 100);
      let name = place.name;
      while (
        name.length > 1 &&
        ctx.measureText(name).width > nameMax
      ) {
        name = name.slice(0, -1);
      }
      if (name !== place.name) name = `${name.trimEnd()}…`;
      ctx.fillText(name, listX + 80, rowCy + 2);

      if (place.rating != null && place.rating > 0) {
        const score = `${formatRating(place.rating)}/5`;
        const pillW = Math.max(110, ctx.measureText(score).width + 36);
        const pillH = 40;
        const pillX = listX + listW - pillW - 18;
        const pillY = rowCy - pillH / 2;

        roundSharePath(ctx, pillX, pillY, pillW, pillH, 999);
        const grad = ctx.createLinearGradient(
          pillX,
          pillY,
          pillX + pillW,
          pillY + pillH
        );
        grad.addColorStop(0, SHARE_BRAND.primary);
        grad.addColorStop(1, SHARE_BRAND.primaryDeep);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.textAlign = "center";
        ctx.fillStyle = SHARE_BRAND.paper;
        ctx.font = `800 22px ${SHARE_BRAND.font}`;
        ctx.fillText(score, pillX + pillW / 2, rowCy + 1);
      }

      ctx.textBaseline = "alphabetic";
      cursorY += rowH;
      shown += 1;
    }

    const remaining = places.length - shown;
    if (remaining > 0 && cursorY + 36 < FOOTER_TOP) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(248, 250, 252, 0.5)";
      ctx.font = `600 24px ${SHARE_BRAND.font}`;
      ctx.fillText(`+${remaining} ${remaining === 1 ? "lugar" : "lugares"}`, centerX, cursorY + 20);
    }
  }

  drawShareFooter(ctx);
  return canvasToPngBlob(canvas);
}

export function buildTripShareText(
  trip: Trip,
  places: PlaceVisit[] = []
): string {
  const parts = [`✈️ ${trip.title}`];
  if (trip.destination) parts.push(trip.destination);
  parts.push(
    `${formatDateBR(trip.start_date)} → ${formatDateBR(trip.end_date)}`
  );
  if (places.length > 0) {
    parts.push("");
    for (const place of places) {
      const emoji = PLACE_TYPE_EMOJI[place.type] ?? "📍";
      const score =
        place.rating != null && place.rating > 0
          ? ` — ${formatRating(place.rating)}/5`
          : "";
      parts.push(`${emoji} ${place.name}${score}`);
    }
  }
  parts.push(`via ${SHARE_BRAND.name}`);
  return parts.join("\n");
}

export async function shareTripNative(
  trip: Trip,
  imageBlob: Blob | null,
  places: PlaceVisit[] = []
) {
  return shareNativePayload({
    title: trip.title,
    text: buildTripShareText(trip, places),
    filename: `${slugify(trip.title)}-viagem.png`,
    imageBlob,
  });
}
