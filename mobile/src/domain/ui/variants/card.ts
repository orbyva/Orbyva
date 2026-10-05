import type { TextStyle, ViewStyle } from "react-native";

import { Radius, Spacing } from "@/constants/theme";
import { TypeScale } from "@/domain/ui/typography";

import { paletteOf, shadowSm, type Scheme } from "./shared";

/** Espelha `src/components/ui/card.tsx` do web, no padding mobile (`p-4`). */
export function resolveCardStyle(scheme: Scheme): {
  container: ViewStyle;
  header: ViewStyle;
  title: TextStyle & { fontFamily: string };
  description: TextStyle & { fontFamily: string };
  content: ViewStyle;
  footer: ViewStyle;
} {
  const p = paletteOf(scheme);
  return {
    container: {
      backgroundColor: p.card,
      borderColor: p.border,
      borderRadius: Radius.xl,
      ...shadowSm(p),
    },
    header: { padding: Spacing.three, gap: Spacing.one },
    title: { ...TypeScale.bodyStrong, color: p.cardForeground },
    description: { ...TypeScale.label, color: p.mutedForeground },
    content: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      paddingHorizontal: Spacing.three,
      paddingBottom: Spacing.three,
    },
  };
}
