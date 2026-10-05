import { lighten } from "@/lib/color";

type HeroTheme = { destructive: string; warning: string; primaryForeground: string };

/** Barra do orçamento no hero (fundo `primary`): tons clareados para ler sobre o azul. */
export function heroBudgetBarColor(pct: number, theme: HeroTheme): string {
  if (pct >= 100) return lighten(theme.destructive, 0.55);
  if (pct >= 80) return lighten(theme.warning, 0.55);
  return theme.primaryForeground;
}
