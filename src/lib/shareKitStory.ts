/** Story/share drawing helpers (Stories 1080×1920). */

import {
  SHARE_W,
  SHARE_H,
  SHARE_BRAND,
  drawShareHeader,
  roundSharePath,
  drawImageCover,
} from "./shareKit";

/** Frame do hero — idêntico ao pôster do cinema (com foto). */
export const STORY_HERO = {
  w: 680,
  h: 1020,
  y: 220,
  radius: 36,
} as const;

/** Hero mais baixo (viagem com card de orçamento). */
export const STORY_HERO_COMPACT = {
  w: 680,
  h: 880,
  y: 220,
  radius: 36,
} as const;

/** Sem foto — card ilustrado, evita caixa vazia gigante. */
export const STORY_HERO_ILLUSTRATED = {
  w: 680,
  h: 620,
  y: 240,
  radius: 36,
} as const;

/** Backdrop estilo cinema: ink + blur da foto + wash + vinheta. */
export function paintStoryBackdrop(
  ctx: CanvasRenderingContext2D,
  options: {
    photo?: HTMLImageElement | null;
    washFrom: string;
    washTo: string;
  }
) {
  ctx.fillStyle = SHARE_BRAND.ink;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);

  if (options.photo) {
    ctx.save();
    ctx.filter = "blur(48px) saturate(1.2) brightness(0.5)";
    drawImageCover(ctx, options.photo, -80, -80, SHARE_W + 160, SHARE_H + 160);
    ctx.restore();
  }

  const wash = ctx.createLinearGradient(0, 0, SHARE_W, SHARE_H);
  wash.addColorStop(0, options.washFrom);
  wash.addColorStop(0.45, "rgba(11, 15, 26, 0.4)");
  wash.addColorStop(1, options.washTo);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);

  const vignette = ctx.createLinearGradient(0, SHARE_H * 0.42, 0, SHARE_H);
  vignette.addColorStop(0, "rgba(11, 15, 26, 0)");
  vignette.addColorStop(0.5, "rgba(11, 15, 26, 0.7)");
  vignette.addColorStop(1, "rgba(11, 15, 26, 0.96)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
}

/** Header esquerdo — coordenadas idênticas ao cinema. */
export function drawStoryHeader(
  ctx: CanvasRenderingContext2D,
  eyebrow: string
) {
  drawShareHeader(ctx, eyebrow);
}


/**
 * Card hero central — mesmo papel do pôster no cinema.
 * Sem foto: slate + glow sky + emoji (+ caption opcional).
 */
export function drawStoryHeroCard(
  ctx: CanvasRenderingContext2D,
  options: {
    photo?: HTMLImageElement | null;
    emoji?: string;
    /** Rótulo sob o emoji (ex.: RESTAURANTE) quando não há foto. */
    caption?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    radius?: number;
  }
) {
  const { photo, emoji, caption, x, y, w, h, radius = 36 } = options;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 28;
  roundSharePath(ctx, x, y, w, h, radius);
  ctx.fillStyle = "#111827";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundSharePath(ctx, x, y, w, h, radius);
  ctx.clip();
  if (photo) {
    drawImageCover(ctx, photo, x, y, w, h);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#1e293b");
    g.addColorStop(0.55, "#0f172a");
    g.addColorStop(1, "#0c4a6e");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    const glow = ctx.createRadialGradient(
      x + w / 2,
      y + h * 0.42,
      20,
      x + w / 2,
      y + h * 0.42,
      w * 0.38
    );
    glow.addColorStop(0, "rgba(14, 165, 233, 0.32)");
    glow.addColorStop(0.55, "rgba(14, 165, 233, 0.1)");
    glow.addColorStop(1, "rgba(14, 165, 233, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, w, h);

    const emojiY = caption ? y + h * 0.42 : y + h / 2;
    if (emoji) {
      ctx.font = `${Math.round(Math.min(w, h) * 0.26)}px "Apple Color Emoji", "Segoe UI Emoji", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, x + w / 2, emojiY);
    }
    if (caption) {
      ctx.fillStyle = "rgba(248, 250, 252, 0.55)";
      ctx.font = `600 28px ${SHARE_BRAND.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(caption, x + w / 2, emojiY + Math.min(w, h) * 0.2);
    }
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 3;
  roundSharePath(ctx, x, y, w, h, radius);
  ctx.stroke();
}

/** Pill de nota centrado (estilo cinema). `topY` = topo do pill. */
export function drawScorePill(
  ctx: CanvasRenderingContext2D,
  options: {
    score: string;
    label: string;
    /** @deprecated use topY — mantido por compat */
    centerY?: number;
    topY?: number;
    width?: number;
    height?: number;
  }
): number {
  const pillW = options.width ?? 480;
  const pillH = options.height ?? 132;
  const pillX = (SHARE_W - pillW) / 2;
  const pillY = (options.topY ?? options.centerY ?? 0) - 12;
  const pillCy = pillY + pillH / 2;

  ctx.save();
  ctx.shadowColor = SHARE_BRAND.primarySoft;
  ctx.shadowBlur = 40;
  roundSharePath(ctx, pillX, pillY, pillW, pillH, 999);
  const pillGrad = ctx.createLinearGradient(
    pillX,
    pillY,
    pillX + pillW,
    pillY + pillH
  );
  pillGrad.addColorStop(0, SHARE_BRAND.primary);
  pillGrad.addColorStop(1, SHARE_BRAND.primaryDeep);
  ctx.fillStyle = pillGrad;
  ctx.fill();
  ctx.restore();

  roundSharePath(ctx, pillX, pillY, pillW, pillH, 999);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = SHARE_BRAND.paper;
  ctx.font = `800 58px ${SHARE_BRAND.font}`;
  ctx.fillText(options.score, SHARE_W / 2, pillCy - 18);
  ctx.fillStyle = "rgba(248, 250, 252, 0.82)";
  ctx.font = `600 24px ${SHARE_BRAND.font}`;
  ctx.fillText(options.label.toUpperCase(), SHARE_W / 2, pillCy + 28);
  ctx.textBaseline = "alphabetic";

  return pillY + pillH;
}

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

/** Chip de recomendação — ícone + texto centrados no chip (e no card). */
export function drawRecommendChip(
  ctx: CanvasRenderingContext2D,
  recommend: boolean,
  topY: number
): number {
  const label = recommend ? "Recomendaria" : "Não recomendaria";
  const accent = recommend ? "#86EFAC" : "#FCA5A5";
  const chipW = recommend ? 340 : 400;
  const chipH = 68;
  const chipX = (SHARE_W - chipW) / 2;
  const chipY = topY - 8;
  const chipCy = chipY + chipH / 2;

  roundSharePath(ctx, chipX, chipY, chipW, chipH, 999);
  ctx.fillStyle = recommend
    ? "rgba(34, 197, 94, 0.14)"
    : "rgba(239, 68, 68, 0.14)";
  ctx.fill();
  roundSharePath(ctx, chipX, chipY, chipW, chipH, 999);
  ctx.strokeStyle = recommend
    ? "rgba(134, 239, 172, 0.35)"
    : "rgba(252, 165, 165, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = `600 27px ${SHARE_BRAND.font}`;
  const textW = ctx.measureText(label).width;
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
  ctx.fillText(label, textX, chipCy + 1);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  return chipY + chipH;
}


/** Máximo de fotos no mosaico de share (viagem). */
export const SHARE_MOSAIC_MAX = 4;

type MosaicCell = { x: number; y: number; w: number; h: number };

function mosaicCells(
  count: number,
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number
): MosaicCell[] {
  const g = gap;
  if (count <= 1) return [{ x, y, w, h }];

  if (count === 2) {
    const cw = (w - g) / 2;
    return [
      { x, y, w: cw, h },
      { x: x + cw + g, y, w: cw, h },
    ];
  }

  if (count === 3) {
    const leftW = (w - g) * 0.58;
    const rightW = w - g - leftW;
    const halfH = (h - g) / 2;
    return [
      { x, y, w: leftW, h },
      { x: x + leftW + g, y, w: rightW, h: halfH },
      { x: x + leftW + g, y: y + halfH + g, w: rightW, h: halfH },
    ];
  }

  // 4+: grade 2×2
  const cw = (w - g) / 2;
  const ch = (h - g) / 2;
  return [
    { x, y, w: cw, h: ch },
    { x: x + cw + g, y, w: cw, h: ch },
    { x, y: y + ch + g, w: cw, h: ch },
    { x: x + cw + g, y: y + ch + g, w: cw, h: ch },
  ];
}

/**
 * Mosaico de fotos no frame do hero (1–4).
 * Sombra + clip externo arredondado + gap entre tiles.
 */
export function drawPhotoMosaic(
  ctx: CanvasRenderingContext2D,
  photos: HTMLImageElement[],
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 36
) {
  const tiles = photos.slice(0, SHARE_MOSAIC_MAX);
  if (tiles.length === 0) return;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 28;
  roundSharePath(ctx, x, y, w, h, radius);
  ctx.fillStyle = "#111827";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundSharePath(ctx, x, y, w, h, radius);
  ctx.clip();

  const gap = tiles.length === 1 ? 0 : 10;
  const cells = mosaicCells(tiles.length, x, y, w, h, gap);

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const img = tiles[i];
    if (!img) continue;
    ctx.save();
    roundSharePath(ctx, cell.x, cell.y, cell.w, cell.h, tiles.length === 1 ? 0 : 12);
    ctx.clip();
    drawImageCover(ctx, img, cell.x, cell.y, cell.w, cell.h);
    ctx.restore();
  }

  ctx.restore();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 3;
  roundSharePath(ctx, x, y, w, h, radius);
  ctx.stroke();
}

/** Estrelas de avaliação (escala 0–5) em canvas. */
export function drawStarRating(
  ctx: CanvasRenderingContext2D,
  rating: number,
  x: number,
  y: number,
  size = 36,
  gap = 10
) {
  const clamped = Math.max(0, Math.min(5, rating));
  for (let i = 0; i < 5; i++) {
    const cx = x + i * (size + gap) + size / 2;
    const fill = clamped >= i + 1 ? 1 : clamped >= i + 0.5 ? 0.5 : 0;
    drawStar(ctx, cx, y, size / 2, fill);
  }
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: number
) {
  const spikes = 5;
  const outer = r;
  const inner = r * 0.45;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 2) * -1 + (i * Math.PI) / spikes;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  if (fill >= 1) {
    ctx.fillStyle = "#FBBF24";
    ctx.fill();
  } else if (fill >= 0.5) {
    ctx.save();
    ctx.fillStyle = "rgba(248, 250, 252, 0.2)";
    ctx.fill();
    ctx.beginPath();
    ctx.rect(cx - r, cy - r, r, r * 2);
    ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = (Math.PI / 2) * -1 + (i * Math.PI) / spikes;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#FBBF24";
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = "rgba(248, 250, 252, 0.2)";
    ctx.fill();
  }
}

