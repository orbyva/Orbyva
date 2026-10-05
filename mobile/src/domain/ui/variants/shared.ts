import { Colors } from "@/constants/theme";

export type Scheme = "light" | "dark";
export type Palette = (typeof Colors)["light"];

/** Alvo de toque mínimo (Apple HIG 44pt; Material 48dp arredonda para cima do mesmo princípio). */
export const MIN_TOUCH = 44;

export function paletteOf(scheme: Scheme): Palette {
  return Colors[scheme];
}

/** `hitSlop` que completa a altura visual até o alvo mínimo. */
export function hitSlopFor(height: number): number {
  return Math.max(0, Math.ceil((MIN_TOUCH - height) / 2));
}

/** Equivalente ao `shadow-sm` do web — leve de propósito (a 098 tirou sombra pesada do iOS). */
export function shadowSm(palette: Palette) {
  return {
    shadowColor: palette.foreground,
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  };
}
