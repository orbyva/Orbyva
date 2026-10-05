import type { TextStyle, ViewStyle } from "react-native";

import { Radius } from "@/constants/theme";
import { TypeScale, fontFor } from "@/domain/ui/typography";
import { hexAlpha } from "@/lib/color";

import { MIN_TOUCH, hitSlopFor, paletteOf, shadowSm, type Scheme } from "./shared";

export { MIN_TOUCH };

/** Mesmos nomes do `buttonVariants` do web (`src/components/ui/button.tsx`). */
export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
export type ButtonSize = "sm" | "default" | "lg" | "icon";

export type ButtonState = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  pressed?: boolean;
};

/**
 * Alturas maiores que as do web (36 no default): no celular o default é o alvo de toque inteiro.
 * O `sm` mantém a altura visual do web e completa o alvo com `hitSlop`.
 */
const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number; width?: number }> = {
  sm: { height: 36, paddingHorizontal: 12 },
  default: { height: MIN_TOUCH, paddingHorizontal: 16 },
  lg: { height: 48, paddingHorizontal: 32 },
  icon: { height: MIN_TOUCH, paddingHorizontal: 0, width: MIN_TOUCH },
};

export function resolveButtonStyle(
  { variant = "default", size = "default", disabled = false, pressed = false }: ButtonState,
  scheme: Scheme
): {
  container: ViewStyle & { minHeight: number; opacity: number };
  label: TextStyle & { color: string; fontFamily: string };
  hitSlop: number;
} {
  const p = paletteOf(scheme);
  const dims = SIZES[size];

  const tone: Record<ButtonVariant, { bg: string; fg: string; border?: string; shadow: boolean }> = {
    default: { bg: pressed ? hexAlpha(p.primary, 0.9) : p.primary, fg: p.primaryForeground, shadow: true },
    destructive: {
      bg: pressed ? hexAlpha(p.destructive, 0.9) : p.destructive,
      fg: p.destructiveForeground,
      shadow: true,
    },
    outline: {
      bg: pressed ? p.accent : p.background,
      fg: pressed ? p.accentForeground : p.foreground,
      border: p.input,
      shadow: true,
    },
    secondary: {
      bg: pressed ? hexAlpha(p.secondary, 0.8) : p.secondary,
      fg: p.secondaryForeground,
      shadow: true,
    },
    ghost: {
      bg: pressed ? p.accent : "transparent",
      fg: pressed ? p.accentForeground : p.foreground,
      shadow: false,
    },
    link: { bg: "transparent", fg: p.primary, shadow: false },
  };
  const t = tone[variant];
  const text = size === "sm" ? TypeScale.caption : TypeScale.label;

  return {
    container: {
      minHeight: dims.height,
      ...(dims.width ? { width: dims.width } : null),
      paddingHorizontal: dims.paddingHorizontal,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: t.border ?? "transparent",
      backgroundColor: t.bg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      opacity: disabled ? 0.5 : 1,
      ...(t.shadow ? shadowSm(p) : null),
    },
    label: {
      fontSize: text.fontSize,
      lineHeight: text.lineHeight,
      fontFamily: fontFor(600),
      color: t.fg,
      ...(variant === "link" && pressed ? { textDecorationLine: "underline" } : null),
    },
    hitSlop: hitSlopFor(dims.height),
  };
}
