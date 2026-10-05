import { describe, expect, it } from "vitest";

import {
  MAX_PROMPT_CHARS,
  MAX_REFERENCE_BASE64_BYTES,
  MAX_REFERENCES,
  MAX_TOTAL_BASE64_BYTES,
  dailyWindow,
  parseGenerateRequest,
  remainingToday,
} from "../../../../supabase/functions/orb-avatar/request.ts";
import { buildOrbImagePrompt } from "../../../../supabase/functions/orb-avatar/prompt.ts";
import {
  buildImageRequest,
  extractPngBase64,
  OrbImageError,
} from "../../../../supabase/functions/orb-avatar/gemini.ts";

const PNG = { mime: "image/png" as const, data: "iVBORw0KGgo=" };

function body(overrides: Record<string, unknown> = {}) {
  return {
    prompt: "uma esfera roxa com anel de luz",
    references: [],
    today: "2026-10-05",
    timezone: "America/Sao_Paulo",
    ...overrides,
  };
}

describe("parseGenerateRequest", () => {
  it("caminho feliz devolve prompt aparado, referências, dia e fuso", () => {
    expect(
      parseGenerateRequest(body({ prompt: "  esfera roxa  ", references: [PNG] }))
    ).toEqual({
      prompt: "esfera roxa",
      references: [PNG],
      today: "2026-10-05",
      timezone: "America/Sao_Paulo",
    });
  });

  it("fuso ausente cai em America/Sao_Paulo e referências ausentes viram lista vazia", () => {
    const parsed = parseGenerateRequest({ prompt: "x", today: "2026-10-05" });
    expect(parsed.timezone).toBe("America/Sao_Paulo");
    expect(parsed.references).toEqual([]);
  });

  it("recusa corpo que não é objeto", () => {
    expect(() => parseGenerateRequest(null)).toThrow(/Pedido inválido/);
  });

  it("recusa prompt vazio", () => {
    expect(() => parseGenerateRequest(body({ prompt: "   " }))).toThrow(/Descreva/);
  });

  it("recusa prompt comprido demais", () => {
    expect(() =>
      parseGenerateRequest(body({ prompt: "a".repeat(MAX_PROMPT_CHARS + 1) }))
    ).toThrow(/500 caracteres/);
  });

  it("recusa mais de 3 referências", () => {
    expect(() =>
      parseGenerateRequest(body({ references: [PNG, PNG, PNG, PNG] }))
    ).toThrow(/no máximo 3/);
  });

  it("recusa mime fora da lista", () => {
    expect(() =>
      parseGenerateRequest(body({ references: [{ mime: "image/gif", data: "R0lG" }] }))
    ).toThrow(/PNG, JPEG ou WebP/);
  });

  it("recusa base64 vazio", () => {
    expect(() =>
      parseGenerateRequest(body({ references: [{ mime: "image/png", data: "" }] }))
    ).toThrow(/vazia/);
  });

  it("recusa referência grande demais", () => {
    const data = "A".repeat(MAX_REFERENCE_BASE64_BYTES + 1);
    expect(() =>
      parseGenerateRequest(body({ references: [{ mime: "image/png", data }] }))
    ).toThrow(/grande demais/);
  });

  it("3 referências no teto individual cabem no teto total", () => {
    const ref = { mime: "image/png", data: "A".repeat(MAX_REFERENCE_BASE64_BYTES) };
    expect(MAX_REFERENCES * MAX_REFERENCE_BASE64_BYTES).toBeLessThanOrEqual(MAX_TOTAL_BASE64_BYTES);
    expect(() => parseGenerateRequest(body({ references: [ref, ref, ref] }))).not.toThrow();
  });

  it("recusa today fora de YYYY-MM-DD", () => {
    expect(() => parseGenerateRequest(body({ today: "05/10/2026" }))).toThrow(/data/);
  });
});

describe("dailyWindow e remainingToday", () => {
  it("o dia da cota é o do fuso do usuário, não o de UTC", () => {
    expect(dailyWindow("2026-10-05", "America/Sao_Paulo")).toEqual({
      start: "2026-10-05T03:00:00.000Z",
      end: "2026-10-06T03:00:00.000Z",
    });
  });

  it("virada de mês", () => {
    expect(dailyWindow("2026-10-31", "UTC")).toEqual({
      start: "2026-10-31T00:00:00.000Z",
      end: "2026-11-01T00:00:00.000Z",
    });
  });

  it("restante nunca fica negativo", () => {
    expect(remainingToday(3, 10)).toBe(7);
    expect(remainingToday(12, 10)).toBe(0);
  });
});

describe("buildOrbImagePrompt", () => {
  it("leva a instrução fixa da Orb e o pedido do usuário no fim", () => {
    const prompt = buildOrbImagePrompt("esfera roxa com anel de luz");
    expect(prompt).toMatch(/1:1/);
    expect(prompt).toMatch(/sem texto/i);
    expect(prompt).toMatch(/esfera/i);
    expect(prompt.trimEnd().endsWith("esfera roxa com anel de luz")).toBe(true);
  });

  it("pede fundo liso e não promete transparência (o modelo devolve RGB e desenha xadrez)", () => {
    const prompt = buildOrbImagePrompt("x");
    expect(prompt).toMatch(/fundo liso/i);
    expect(prompt).toMatch(/sem padrão xadrez/i);
    expect(prompt).not.toMatch(/ou transparente/i);
  });
});

describe("buildImageRequest", () => {
  it("uma parte inlineData por referência, na ordem, e o texto por último", () => {
    const jpeg = { mime: "image/jpeg" as const, data: "/9j/" };
    const req = buildImageRequest({
      model: "gemini-2.5-flash-image",
      prompt: "PROMPT",
      references: [PNG, jpeg],
    });
    expect(req.model).toBe("gemini-2.5-flash-image");
    expect(req.config.responseModalities).toEqual(["IMAGE"]);
    expect(req.contents).toEqual([
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/png", data: PNG.data } },
          { inlineData: { mimeType: "image/jpeg", data: "/9j/" } },
          { text: "PROMPT" },
        ],
      },
    ]);
  });
});

describe("extractPngBase64", () => {
  it("devolve o base64 da primeira parte de imagem", () => {
    expect(
      extractPngBase64({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [{ text: "aqui está" }, { inlineData: { mimeType: "image/png", data: "QUJD" } }],
            },
          },
        ],
      })
    ).toEqual({ base64: "QUJD" });
  });

  it("recusa do modelo vira erro de recusa", () => {
    try {
      extractPngBase64({ candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(OrbImageError);
      expect((err as OrbImageError).kind).toBe("refused");
    }
  });

  it("prompt bloqueado antes de gerar também é recusa", () => {
    try {
      extractPngBase64({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } });
      expect.unreachable();
    } catch (err) {
      expect((err as OrbImageError).kind).toBe("refused");
    }
  });

  it("resposta sem parte de imagem vira erro próprio", () => {
    try {
      extractPngBase64({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: "não consegui" }] } }],
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(OrbImageError);
      expect((err as OrbImageError).kind).toBe("no_image");
    }
  });
});
