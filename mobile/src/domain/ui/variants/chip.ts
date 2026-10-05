import type { TextStyle, ViewStyle } from "react-native";

import { Radius } from "@/constants/theme";
import { TypeScale, fontFor } from "@/domain/ui/typography";
import { hexAlpha } from "@/lib/color";

import { hitSlopFor, paletteOf, type Scheme } from "./shared";

const HEIGHT = 32;

export function resolveChipStyle(
  { selected, tint }: { selected: boolean; tint?: string },
  scheme: Scheme
): {
  container: ViewStyle & { minHeight: number };
  label: TextStyle & { color: string; fontFamily: string };
  hitSlop: number;
} {
  const p = paletteOf(scheme);
  const accent = tint ?? p.primary;
  return {
    container: {
      minHeight: HEIGHT,
      paddingHorizontal: 12,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: selected ? accent : p.border,
      backgroundColor: selected ? hexAlpha(accent, 0.14) : "transparent",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    label: {
      fontSize: TypeScale.caption.fontSize,
      lineHeight: TypeScale.caption.lineHeight,
      fontFamily: fontFor(selected ? 600 : 500),
      color: selected ? accent : p.foreground,
    },
    hitSlop: hitSlopFor(HEIGHT),
  };
}
