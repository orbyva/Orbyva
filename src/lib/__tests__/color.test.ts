import { describe, expect, it } from "vitest";
import { contrastTextColor } from "@/lib/color";

describe("contrastTextColor", () => {
  it("retorna preto sobre fundo claro", () => {
    expect(contrastTextColor("#ffff00")).toBe("#000000");
    expect(contrastTextColor("#eab308")).toBe("#000000");
  });

  it("retorna branco sobre fundo escuro", () => {
    expect(contrastTextColor("#000000")).toBe("#ffffff");
    expect(contrastTextColor("#1d4ed8")).toBe("#ffffff");
  });
});
