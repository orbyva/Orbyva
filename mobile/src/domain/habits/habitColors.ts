import { hexAlpha } from "@/lib/color";
import type { HabitHeatCell } from "@/types/habits";

type HabitTheme = {
  background: string;
  border: string;
  muted: string;
  destructive: string;
  chart6: string;
};

/** Hábito a evitar ganha o teal `chart6` para não se confundir com o verde de Vida. */
export function habitAccent(avoid: boolean, life: string, theme: HabitTheme): string {
  return avoid ? theme.chart6 : life;
}

export function missedTint(theme: HabitTheme, alpha: number): string {
  return hexAlpha(theme.destructive, alpha);
}

export function heatCellColor(cell: HabitHeatCell, accent: string, theme: HabitTheme): string {
  if (cell.status === "future") return theme.border;
  if (cell.status === "empty") return theme.muted;
  if (cell.status === "missed") return missedTint(theme, 0.16);
  if (cell.status === "partial") {
    if (cell.rate < 0.34) return hexAlpha(accent, 0.28);
    if (cell.rate < 0.67) return hexAlpha(accent, 0.5);
    return hexAlpha(accent, 0.7);
  }
  if (cell.status === "done" || (cell.status === "today" && cell.rate >= 1)) return accent;
  if (cell.status === "today" && cell.rate > 0) return hexAlpha(accent, 0.45);
  return theme.background;
}
