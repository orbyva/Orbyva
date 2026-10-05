import type { TextStyle, ViewStyle } from "react-native";

import { Radius } from "@/constants/theme";
import { TypeScale } from "@/domain/ui/typography";

import { MIN_TOUCH, paletteOf, type Scheme } from "./shared";

export type InputState = {
  focused?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  multiline?: boolean;
};

/** Espelha `src/components/ui/input.tsx`: `h-10 rounded-md border-input px-3 text-base`. */
export function resolveInputStyle(
  { focused = false, invalid = false, disabled = false, multiline = false }: InputState,
  scheme: Scheme
): {
  container: ViewStyle & { minHeight: number; opacity: number };
  text: TextStyle & { color: string; fontFamily: string; fontSize: number };
  placeholderColor: string;
} {
  const p = paletteOf(scheme);
  return {
    container: {
      minHeight: multiline ? 96 : MIN_TOUCH,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: invalid ? p.destructive : focused ? p.ring : p.input,
      backgroundColor: "transparent",
      paddingHorizontal: 12,
      paddingVertical: multiline ? 10 : 0,
      justifyContent: multiline ? "flex-start" : "center",
      opacity: disabled ? 0.5 : 1,
    },
    text: {
      ...TypeScale.body,
      color: p.foreground,
      ...(multiline ? { textAlignVertical: "top" } : null),
    },
    placeholderColor: p.mutedForeground,
  };
}
