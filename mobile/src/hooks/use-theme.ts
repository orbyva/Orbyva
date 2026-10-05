import { Colors, ModuleColors, ModuleForegrounds } from "@/constants/theme";
import { useOptionalThemeScheme } from "@/hooks/use-theme-preference";

export function useTheme() {
  const scheme = useOptionalThemeScheme();
  return Colors[scheme];
}

export function useModuleColors() {
  const scheme = useOptionalThemeScheme();
  return ModuleColors[scheme];
}

export function useModuleForegrounds() {
  const scheme = useOptionalThemeScheme();
  return ModuleForegrounds[scheme];
}
