import { Colors } from "@/constants/theme";
import { useOptionalThemeScheme } from "@/hooks/use-theme-preference";

export function useTheme() {
  const scheme = useOptionalThemeScheme();
  return Colors[scheme];
}
