import { describe, expect, it } from "vitest";
import { sumSharedTripSpent, sumTripSpent } from "@/domain/travel/spent";

describe("sumSharedTripSpent", () => {
  it("ignora despesas pessoais e soma só shared", () => {
    expect(
      sumSharedTripSpent([
        { amount: 100, visibility: "personal" },
        { amount: 50, visibility: "shared" },
        { amount: 25, visibility: "shared" },
        { amount: 10 },
      ])
    ).toBe(75);
  });

  it("trata null/undefined visibility como pessoal", () => {
    expect(
      sumSharedTripSpent([
        { amount: 40, visibility: null },
        { amount: "20.5", visibility: "shared" },
      ])
    ).toBe(20.5);
  });
});

describe("sumTripSpent", () => {
  const rows = [
    { amount: 100, visibility: "personal" as const },
    { amount: 40, visibility: "shared" as const },
  ];

  it("em viagem solo soma tudo", () => {
    expect(sumTripSpent(rows, false)).toBe(140);
  });

  it("em viagem compartilhada soma só shared", () => {
    expect(sumTripSpent(rows, true)).toBe(40);
  });
});
