import { describe, expect, it } from "vitest";

import { ModuleColors } from "@/constants/theme";
import { NAV_GROUPS } from "@/lib/nav";

describe("NAV_GROUPS", () => {
  it("cada grupo da sidebar aponta para a cor de módulo do web", () => {
    expect(NAV_GROUPS.map((g) => [g.title, g.module])).toEqual([
      ["Início", "hub"],
      ["Finanças", "finance"],
      ["Produtividade", "productivity"],
      ["Vida", "life"],
      ["Conteúdo", "entertainment"],
    ]);
    for (const group of NAV_GROUPS) {
      expect(ModuleColors.light[group.module]).toMatch(/^#[0-9A-F]{6}$/);
      expect(ModuleColors.dark[group.module]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
