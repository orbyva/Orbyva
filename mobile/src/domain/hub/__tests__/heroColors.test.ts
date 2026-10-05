import { describe, expect, it } from "vitest";

import { Colors } from "@/constants/theme";
import { heroBudgetBarColor } from "@/domain/hub/heroColors";
import { lighten } from "@/lib/color";

const theme = Colors.light;

describe("lighten", () => {
  it("mistura o hex com branco na proporção pedida", () => {
    expect(lighten("#000000", 0)).toBe("#000000");
    expect(lighten("#000000", 1)).toBe("#FFFFFF");
    expect(lighten("#000000", 0.5)).toBe("#808080");
    expect(lighten("#DC2828", 0.55)).toBe("#EF9E9E");
  });
});

describe("heroBudgetBarColor", () => {
  it("estourado e quase usam destrutivo/alerta clareados (legíveis sobre o primary)", () => {
    expect(heroBudgetBarColor(120, theme)).toBe(lighten(theme.destructive, 0.55));
    expect(heroBudgetBarColor(100, theme)).toBe(lighten(theme.destructive, 0.55));
    expect(heroBudgetBarColor(85, theme)).toBe(lighten(theme.warning, 0.55));
  });

  it("dentro do teto usa o texto sobre primary", () => {
    expect(heroBudgetBarColor(40, theme)).toBe(theme.primaryForeground);
  });
});
