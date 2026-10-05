import { describe, expect, it } from "vitest";

import {
  isSupportedReferenceMime,
  MAX_REFERENCES,
  REFERENCE_MAX_EDGE,
  REFERENCE_MIMES,
  targetSize,
} from "@/domain/orb/avatarImage";
import {
  MAX_REFERENCES as SERVER_MAX_REFERENCES,
  REFERENCE_MIMES as SERVER_REFERENCE_MIMES,
} from "../../../../supabase/functions/orb-avatar/request.ts";

describe("targetSize", () => {
  it("retrato: a altura vira o teto e a largura acompanha a proporção", () => {
    expect(targetSize({ width: 1500, height: 3000 }, 768)).toEqual({ width: 384, height: 768 });
  });

  it("paisagem: a largura vira o teto", () => {
    expect(targetSize({ width: 4000, height: 3000 }, 768)).toEqual({ width: 768, height: 576 });
  });

  it("quadrado", () => {
    expect(targetSize({ width: 2048, height: 2048 }, 768)).toEqual({ width: 768, height: 768 });
  });

  it("arredonda para inteiro", () => {
    expect(targetSize({ width: 1000, height: 333 }, 768)).toEqual({ width: 768, height: 256 });
  });

  it("imagem menor que o teto volta igual (nunca amplia)", () => {
    expect(targetSize({ width: 500, height: 300 }, 768)).toEqual({ width: 500, height: 300 });
  });

  it("1 px continua 1 px, e o lado curto nunca zera", () => {
    expect(targetSize({ width: 1, height: 1 }, 768)).toEqual({ width: 1, height: 1 });
    expect(targetSize({ width: 10000, height: 1 }, 768)).toEqual({ width: 768, height: 1 });
  });
});

describe("referências", () => {
  it("aceita só PNG, JPEG e WebP", () => {
    expect(isSupportedReferenceMime("image/png")).toBe(true);
    expect(isSupportedReferenceMime("image/jpeg")).toBe(true);
    expect(isSupportedReferenceMime("image/webp")).toBe(true);
    expect(isSupportedReferenceMime("image/gif")).toBe(false);
    expect(isSupportedReferenceMime("application/pdf")).toBe(false);
    expect(isSupportedReferenceMime("")).toBe(false);
  });

  it("limites do cliente são os mesmos da Edge Function", () => {
    expect(MAX_REFERENCES).toBe(SERVER_MAX_REFERENCES);
    expect([...REFERENCE_MIMES]).toEqual([...SERVER_REFERENCE_MIMES]);
    expect(REFERENCE_MAX_EDGE).toBe(768);
  });
});
