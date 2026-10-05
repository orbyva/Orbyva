import { describe, expect, it } from "vitest";

import { hslToHex, ON_MEDIA, SCRIM, scrim } from "@/domain/ui/color";

describe("hslToHex", () => {
  it("converte os extremos", () => {
    expect(hslToHex("0 0% 100%")).toBe("#FFFFFF");
    expect(hslToHex("0 0% 0%")).toBe("#000000");
  });

  it("converte o primary e o fundo escuro do web", () => {
    expect(hslToHex("199 89% 36%")).toBe("#0A7AAE");
    expect(hslToHex("222 47% 6%")).toBe("#080C16");
  });

  it("aceita espaços extras", () => {
    expect(hslToHex("  0   0%   100%  ")).toBe("#FFFFFF");
  });

  it("recusa formato fora do padrão do index.css", () => {
    expect(() => hslToHex("199, 89%, 36%")).toThrow();
    expect(() => hslToHex("199 89 36")).toThrow();
    expect(() => hslToHex("")).toThrow();
  });
});

describe("scrim", () => {
  it("é a tinta escura da marca na opacidade pedida, igual nos dois temas", () => {
    expect(scrim(0.8)).toBe("rgba(11,15,26,0.8)");
    expect(SCRIM).toBe(scrim(0.45));
  });

  it("texto sobre capa é branco fixo", () => {
    expect(ON_MEDIA).toBe("#FFFFFF");
  });
});
