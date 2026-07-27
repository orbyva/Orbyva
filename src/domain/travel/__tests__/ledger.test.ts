import { describe, expect, it } from "vitest";
import {
  isTripLedgerDescription,
  sumTripSpendFromTransactions,
  tripLedgerDescription,
} from "@/domain/travel/ledger";

describe("trip ledger tag", () => {
  it("formata descrição com tag", () => {
    expect(tripLedgerDescription("Chile", "Hotéis")).toBe(
      "Viagem · Chile: Hotéis"
    );
    expect(
      tripLedgerDescription("Chile", "Almoço", { shareSlice: true })
    ).toBe("Viagem · Chile (fatia): Almoço");
  });

  it("detecta prefixos legados e novos", () => {
    expect(isTripLedgerDescription("Viagem · Chile: X")).toBe(true);
    expect(isTripLedgerDescription("Viagem Chile: X")).toBe(true);
    expect(isTripLedgerDescription("Viagem (fatia): X")).toBe(true);
    expect(isTripLedgerDescription("Mercado")).toBe(false);
  });

  it("soma gastos de viagem", () => {
    expect(
      sumTripSpendFromTransactions([
        { description: "Viagem · Chile: Hotel", value: 800 },
        { description: "Viagem Antiga: X", value: 100 },
        { description: "Uber", value: 50 },
      ])
    ).toBe(900);
  });
});
