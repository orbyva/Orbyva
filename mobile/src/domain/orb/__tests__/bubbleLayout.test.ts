import { describe, expect, it } from "vitest";

import { diagramAspectRatio, orbBubbleWidth } from "@/domain/orb/bubbleLayout";

describe("orbBubbleWidth", () => {
  it("balão da Orb tem largura definida", () => {
    expect(orbBubbleWidth("assistant")).toEqual({ width: "92%" });
  });

  it("balão do usuário encolhe pelo conteúdo", () => {
    expect(orbBubbleWidth("user")).toEqual({ maxWidth: "92%" });
  });
});

describe("diagramAspectRatio", () => {
  it("usa a proporção real da imagem", () => {
    expect(diagramAspectRatio(800, 400)).toBe(2);
  });

  it("limita diagramas muito altos ou muito largos", () => {
    expect(diagramAspectRatio(100, 1000)).toBe(0.4);
    expect(diagramAspectRatio(5000, 100)).toBe(4);
  });

  it("sem tamanho cai no padrão", () => {
    expect(diagramAspectRatio()).toBeCloseTo(16 / 9);
    expect(diagramAspectRatio(0, 300)).toBeCloseTo(16 / 9);
  });
});
