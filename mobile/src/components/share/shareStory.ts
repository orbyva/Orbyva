/** Medidas do canvas web (Stories 1080×1920). */

export const SHARE_W = 1080;
export const SHARE_H = 1920;
export const SHARE_PREVIEW_W = 270;
export const SHARE_PREVIEW_H = 480;

export type CoverVariant = "poster" | "book" | "square" | "photo" | "badge";

export type HeroMetrics = {
  w: number;
  h: number;
  y: number;
  radius: number;
  after: number;
};

export function heroMetrics(options: {
  variant: CoverVariant;
  hasCover: boolean;
  hasItems: boolean;
  hasNotes: boolean;
  photoCount?: number;
}): HeroMetrics {
  const { variant, hasCover, hasItems, hasNotes, photoCount = 0 } = options;

  if (variant === "badge") {
    return { w: 160, h: 160, y: 200, radius: 36, after: 48 };
  }

  if (!hasCover) {
    const h = hasItems ? 420 : 620;
    return { w: 680, h, y: 240, radius: 36, after: hasItems ? 56 : 72 };
  }

  if (variant === "book") {
    return { w: 520, h: 780, y: 200, radius: 28, after: 72 };
  }

  if (variant === "square") {
    const size = hasItems ? (hasNotes ? 420 : 480) : 680;
    return {
      w: size,
      h: size,
      y: hasItems ? 200 : 220,
      radius: 28,
      after: hasItems ? 48 : 72,
    };
  }

  if (variant === "photo") {
    const h =
      photoCount >= 3 ? 560 : photoCount === 1 ? 780 : photoCount === 2 ? 520 : 780;
    return { w: 680, h, y: 200, radius: 36, after: 72 };
  }

  if (hasItems) {
    return hasNotes
      ? { w: 360, h: 540, y: 200, radius: 28, after: 48 }
      : { w: 420, h: 630, y: 200, radius: 28, after: 48 };
  }

  return { w: 680, h: 1020, y: 220, radius: 36, after: 88 };
}

export function pickShareItems<T extends { score: string }>(
  items: T[],
  limit: number
): T[] {
  if (items.length <= limit) return items;
  return [...items]
    .sort((a, b) => {
      const sa = Number(String(a.score).replace(",", ".")) || 0;
      const sb = Number(String(b.score).replace(",", ".")) || 0;
      return sb - sa;
    })
    .slice(0, limit);
}

type MosaicCell = { x: number; y: number; w: number; h: number };

export function mosaicCells(
  count: number,
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number
): MosaicCell[] {
  if (count <= 1) return [{ x, y, w, h }];

  if (count === 2) {
    const cw = (w - gap) / 2;
    return [
      { x, y, w: cw, h },
      { x: x + cw + gap, y, w: cw, h },
    ];
  }

  if (count === 3) {
    const leftW = (w - gap) * 0.58;
    const rightW = w - gap - leftW;
    const halfH = (h - gap) / 2;
    return [
      { x, y, w: leftW, h },
      { x: x + leftW + gap, y, w: rightW, h: halfH },
      { x: x + leftW + gap, y: y + halfH + gap, w: rightW, h: halfH },
    ];
  }

  const cw = (w - gap) / 2;
  const ch = (h - gap) / 2;
  return [
    { x, y, w: cw, h: ch },
    { x: x + cw + gap, y, w: cw, h: ch },
    { x, y: y + ch + gap, w: cw, h: ch },
    { x: x + cw + gap, y: y + ch + gap, w: cw, h: ch },
  ];
}
