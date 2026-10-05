import { Colors } from "@/constants/theme";
import type { ThemeScheme } from "@/hooks/use-theme-preference";

/** Mesmo `imageWidth` do plugin `expo-splash-screen` no `app.json`: a troca nativa → JS não pula. */
export const SPLASH_LOGO_SIZE = 120;

export function bootSplashBackground(scheme: ThemeScheme): string {
  return Colors[scheme].background;
}
