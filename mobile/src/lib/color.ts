function hexAlpha(hex: string, alpha: number): string {
  const n = hex.replace("#", "");
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
  theme: { primary: string; backgroundElement: string },
  active: boolean
) {
  return {
    backgroundColor: active
      ? hexAlpha(theme.primary, 0.16)
      : theme.backgroundElement,
    borderColor: active ? theme.primary : "transparent",
    borderWidth: 1 as const,
  };
}

export { hexAlpha };
