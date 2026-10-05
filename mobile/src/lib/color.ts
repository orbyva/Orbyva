function hexAlpha(hex: string, alpha: number): string {
  const n = hex.replace("#", "");
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`; // token-livre: construtor de alfa sobre token
}

/** Mistura o hex com branco (`amount` 0–1) — tom claro de um token para fundo saturado. */
export function lighten(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const channel = (i: number) => {
    const v = Number.parseInt(n.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * amount)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

export function tintedSurface(hex: string): {
  backgroundColor: string;
  borderColor: string;
} {
  return {
    backgroundColor: hexAlpha(hex, 0.1),
    borderColor: hexAlpha(hex, 0.38),
  };
}

export function choiceChipColors(
  theme: { primary: string; muted: string },
  active: boolean
) {
  return {
    backgroundColor: active
      ? hexAlpha(theme.primary, 0.16)
      : theme.muted,
    borderColor: active ? theme.primary : "transparent",
    borderWidth: 1 as const,
  };
}

export { hexAlpha };
