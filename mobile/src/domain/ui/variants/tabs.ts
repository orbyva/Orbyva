import type { TextStyle, ViewStyle } from "react-native";

import { Radius } from "@/constants/theme";
import { TypeScale, fontFor } from "@/domain/ui/typography";

import { paletteOf, shadowSm, type Scheme } from "./shared";

/** Segmento no papel do `TabsList`/`TabsTrigger` do web. */
export function resolveTabsStyle(scheme: Scheme): {
  track: ViewStyle;
  tab: ViewStyle;
  tabActive: ViewStyle;
  label: TextStyle & { color: string; fontFamily: string };
  labelActive: TextStyle & { color: string; fontFamily: string };
} {
  const p = paletteOf(scheme);
  const text = { fontSize: TypeScale.label.fontSize, lineHeight: TypeScale.label.lineHeight };
  return {
    track: {
      flexDirection: "row",
      backgroundColor: p.muted,
      borderRadius: Radius.lg,
      padding: 3,
      gap: 3,
    },
    tab: {
      flex: 1,
      minHeight: 36,
      borderRadius: Radius.md,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
    },
    tabActive: { backgroundColor: p.background, ...shadowSm(p) },
    label: { ...text, fontFamily: fontFor(500), color: p.mutedForeground },
    labelActive: { ...text, fontFamily: fontFor(600), color: p.foreground },
  };
}
