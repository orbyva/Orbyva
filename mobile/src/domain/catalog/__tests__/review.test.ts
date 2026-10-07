import { describe, expect, it } from "vitest";

import { catalogCardReview, catalogReview } from "@/domain/catalog/review";

describe("catalogReview", () => {
  it("terminado: indicaria padrão é sim, só false explícito é não", () => {
    expect(catalogReview({}, true).recommend).toBe(true);
    expect(catalogReview({ would_recommend: true }, true).recommend).toBe(true);
    expect(catalogReview({ would_recommend: false }, true).recommend).toBe(false);
  });

  it("não terminado: sem indicaria, mas a observação continua", () => {
    expect(catalogReview({ notes: "  ótimo  ", would_recommend: false }, false)).toEqual({
      recommend: null,
      notes: "ótimo",
    });
  });

  it("observação vazia ou só espaço vira null", () => {
    expect(catalogReview({ notes: "   " }, true).notes).toBeNull();
    expect(catalogReview({ notes: null }, true).notes).toBeNull();
  });
});

describe("catalogCardReview", () => {
  it("card só mostra opinião de quem terminou", () => {
    expect(catalogCardReview({ notes: "x", would_recommend: false }, false)).toEqual({
      recommend: null,
      notes: null,
    });
    expect(catalogCardReview({ notes: "x", would_recommend: false }, true)).toEqual({
      recommend: false,
      notes: "x",
    });
  });
});
