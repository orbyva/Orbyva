import { describe, expect, it } from "vitest";

import { Colors, ModuleColors } from "@/constants/theme";
import { habitAccent, heatCellColor, missedTint } from "@/domain/habits/habitColors";
import { hexAlpha } from "@/lib/color";
import type { HabitHeatCell } from "@/types/habits";

const theme = Colors.light;
const life = ModuleColors.light.life;

function cell(status: HabitHeatCell["status"], rate = 0): HabitHeatCell {
  return { date: "2026-10-02", dayOfMonth: 2, status, rate, done: 0, total: 1 };
}

describe("habitAccent", () => {
  it("hábito normal usa o verde de Vida do web", () => {
    expect(habitAccent(false, life, theme)).toBe(life);
  });

  it("hábito a evitar usa o teal chart6, distinto de Vida", () => {
    expect(habitAccent(true, life, theme)).toBe(theme.chart6);
    expect(theme.chart6).not.toBe(life);
  });
});

describe("heatCellColor", () => {
  const accent = life;

  it("parcial escala a intensidade do acento pela taxa", () => {
    const low = heatCellColor(cell("partial", 0.2), accent, theme);
    const mid = heatCellColor(cell("partial", 0.5), accent, theme);
    const high = heatCellColor(cell("partial", 0.9), accent, theme);
    expect(low).toBe(hexAlpha(accent, 0.28));
    expect(mid).toBe(hexAlpha(accent, 0.5));
    expect(high).toBe(hexAlpha(accent, 0.7));
    expect(new Set([low, mid, high]).size).toBe(3);
  });

  it("feito e hoje completo usam o acento cheio", () => {
    expect(heatCellColor(cell("done", 1), accent, theme)).toBe(accent);
    expect(heatCellColor(cell("today", 1), accent, theme)).toBe(accent);
  });

  it("hoje em andamento usa o acento a 45%", () => {
    expect(heatCellColor(cell("today", 0.5), accent, theme)).toBe(hexAlpha(accent, 0.45));
  });

  it("falha deriva de destructive; futuro/vazio dos tokens neutros", () => {
    expect(heatCellColor(cell("missed"), accent, theme)).toBe(missedTint(theme, 0.16));
    expect(missedTint(theme, 0.16)).toBe(hexAlpha(theme.destructive, 0.16));
    expect(heatCellColor(cell("future"), accent, theme)).toBe(theme.border);
    expect(heatCellColor(cell("empty"), accent, theme)).toBe(theme.muted);
    expect(heatCellColor(cell("today", 0), accent, theme)).toBe(theme.background);
  });

  it("segue o acento do tema escuro", () => {
    const darkLife = ModuleColors.dark.life;
    expect(heatCellColor(cell("done", 1), darkLife, Colors.dark)).toBe(darkLife);
  });
});
