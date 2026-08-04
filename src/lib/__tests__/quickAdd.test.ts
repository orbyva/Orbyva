import { describe, expect, it } from "vitest";
import {
  areaLabel,
  quickAddActionsForArea,
  resolveAppArea,
} from "@/lib/quickAdd";

describe("resolveAppArea", () => {
  it("resolve por pathname", () => {
    expect(resolveAppArea("/finance/transactions")).toBe("finance");
    expect(resolveAppArea("/movies")).toBe("entertainment");
    expect(resolveAppArea("/books/1")).toBe("entertainment");
    expect(resolveAppArea("/music")).toBe("entertainment");
    expect(resolveAppArea("/habits")).toBe("life");
    expect(resolveAppArea("/places")).toBe("life");
    expect(resolveAppArea("/travel/abc")).toBe("life");
    expect(resolveAppArea("/home")).toBe("home");
    expect(resolveAppArea("/account")).toBe("home");
  });
});

describe("quickAddActionsForArea", () => {
  it("filtra por área", () => {
    const finance = quickAddActionsForArea("finance");
    expect(finance.every((a) => a.area === "finance")).toBe(true);
    expect(finance.map((a) => a.id)).toContain("recurring");

    const life = quickAddActionsForArea("life");
    expect(life.map((a) => a.id)).toEqual(
      expect.arrayContaining(["place", "trip", "habit"])
    );
  });

  it("home devolve mix curado", () => {
    const home = quickAddActionsForArea("home");
    expect(home.map((a) => a.id)).toEqual([
      "expense",
      "income",
      "movie",
      "habit",
      "place",
      "trip",
    ]);
  });

  it("areaLabel", () => {
    expect(areaLabel("finance")).toBe("Finanças");
    expect(areaLabel("life")).toBe("Vida");
  });
});
