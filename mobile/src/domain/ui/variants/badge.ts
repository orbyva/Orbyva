import type { TextStyle, ViewStyle } from "react-native";

import { Radius } from "@/constants/theme";
import { TypeScale } from "@/domain/ui/typography";
import { hexAlpha } from "@/lib/color";

import { paletteOf, type Scheme } from "./shared";

/** As 4 do web (`src/components/ui/badge.tsx`) + `success`/`warning` tingidos para status. */
export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

export function resolveBadgeStyle(
  variant: BadgeVariant,
  scheme: Scheme
): {
  container: ViewStyle & { borderRadius: number };
  label: TextStyle & { color: string; fontFamily: string };
} {
  const p = paletteOf(scheme);
  const tinted = (color: string) => ({
    bg: hexAlpha(color, 0.12),
    fg: color,
    border: hexAlpha(color, 0.3),
  });
  const tone: Record<BadgeVariant, { bg: string; fg: string; border: string }> = {
    default: { bg: p.primary, fg: p.primaryForeground, border: "transparent" },
    secondary: { bg: p.secondary, fg: p.secondaryForeground, border: "transparent" },
    destructive: { bg: p.destructive, fg: p.destructiveForeground, border: "transparent" },
    outline: { bg: "transparent", fg: p.foreground, border: p.border },
    success: tinted(p.success),
    warning: tinted(p.warning),
  };
  const t = tone[variant];

  return {
    container: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg,
      paddingHorizontal: 10,
      paddingVertical: 2,
    },
    label: { ...TypeScale.micro, color: t.fg },
  };
}
