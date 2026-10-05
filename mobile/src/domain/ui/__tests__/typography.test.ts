import { describe, expect, it } from "vitest";

import {
  FontFamily,
  TypeScale,
  fontFor,
  weightToFamily,
} from "@/domain/ui/typography";

describe("weightToFamily", () => {
  it("troca fontWeight solto pela família do mesmo peso, mantendo a fonte base", () => {
    expect(weightToFamily(TypeScale.body, { fontWeight: "700" })).toEqual({
      fontFamily: "PlusJakartaSans_700Bold",
    });
    expect(weightToFamily(TypeScale.caption, { fontWeight: 600 })).toEqual({
      fontFamily: "PlusJakartaSans_600SemiBold",
    });
  });

  it("em base Syne continua em Syne", () => {
    expect(weightToFamily(TypeScale.title, { fontWeight: "600" })).toEqual({
      fontFamily: "Syne_600SemiBold",
    });
  });

  it("'bold'/'normal' e pesos fora da escala caem no passo mais próximo", () => {
    expect(weightToFamily(TypeScale.body, { fontWeight: "bold" })).toEqual({
      fontFamily: "PlusJakartaSans_700Bold",
    });
    expect(weightToFamily(TypeScale.body, { fontWeight: "normal" })).toEqual({
      fontFamily: "PlusJakartaSans_400Regular",
    });
    expect(weightToFamily(TypeScale.body, { fontWeight: "800" })).toEqual({
      fontFamily: "PlusJakartaSans_700Bold",
    });
    expect(weightToFamily(TypeScale.body, { fontWeight: "300" })).toEqual({
      fontFamily: "PlusJakartaSans_400Regular",
    });
  });

  it("não mexe quando não há fontWeight ou quando a tela já define fontFamily", () => {
    expect(weightToFamily(TypeScale.body, {})).toEqual({});
    expect(
      weightToFamily(TypeScale.body, { fontWeight: "700", fontFamily: "monospace" })
    ).toEqual({ fontWeight: "700", fontFamily: "monospace" });
  });

  it("base mono não é traduzida", () => {
    expect(weightToFamily(TypeScale.mono, { fontWeight: "700" })).toEqual({
      fontWeight: "700",
    });
  });
});

describe("fontFor", () => {
  it("devolve a família de cada peso da Plus Jakarta Sans", () => {
    expect(fontFor(400)).toBe("PlusJakartaSans_400Regular");
    expect(fontFor(500)).toBe("PlusJakartaSans_500Medium");
    expect(fontFor(600)).toBe("PlusJakartaSans_600SemiBold");
    expect(fontFor(700)).toBe("PlusJakartaSans_700Bold");
  });

  it("display usa Syne e só tem 600/700 — peso menor sobe para 600", () => {
    expect(fontFor(700, true)).toBe("Syne_700Bold");
    expect(fontFor(600, true)).toBe("Syne_600SemiBold");
    expect(fontFor(400, true)).toBe("Syne_600SemiBold");
    expect(fontFor(500, true)).toBe("Syne_600SemiBold");
  });

  it("FontFamily lista só os 6 arquivos carregados no _layout", () => {
    expect(Object.values(FontFamily).sort()).toEqual(
      [
        "PlusJakartaSans_400Regular",
        "PlusJakartaSans_500Medium",
        "PlusJakartaSans_600SemiBold",
        "PlusJakartaSans_700Bold",
        "Syne_600SemiBold",
        "Syne_700Bold",
      ].sort()
    );
  });
});

describe("TypeScale", () => {
  const entries = Object.entries(TypeScale);

  it("nenhum estilo usa fontWeight — no Android o peso vem da família", () => {
    for (const [name, style] of entries) {
      expect(style, name).not.toHaveProperty("fontWeight");
    }
  });

  it("estilos em Syne têm lineHeight folgado (glifos passam do em-box)", () => {
    for (const [name, style] of entries) {
      if (!style.fontFamily.startsWith("Syne")) continue;
      expect(style.lineHeight, name).toBeGreaterThanOrEqual(1.3 * style.fontSize);
    }
  });

  it("título de tela e valores grandes em Syne; corpo em Plus Jakarta 16", () => {
    expect(TypeScale.display.fontFamily).toBe("Syne_700Bold");
    expect(TypeScale.title.fontFamily).toBe("Syne_700Bold");
    expect(TypeScale.value.fontFamily).toBe("Syne_700Bold");
    expect(TypeScale.body).toMatchObject({
      fontFamily: "PlusJakartaSans_400Regular",
      fontSize: 16,
    });
  });

  it("todo estilo de texto usa uma família carregada (exceto mono)", () => {
    const loaded = new Set<string>(Object.values(FontFamily));
    for (const [name, style] of entries) {
      if (name === "mono") continue;
      expect(loaded.has(style.fontFamily), name).toBe(true);
    }
  });
});
