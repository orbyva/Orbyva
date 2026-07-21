import { describe, expect, it } from "vitest";

/**
 * Contrato de tenancy (P0): APIs devem sempre amarrar leituras/escritas ao user_id.
 * Este teste documenta as tabelas dono-direto vs. filhas (via assert*Owned).
 */
const OWNER_SCOPED_TABLES = [
  "movie",
  "transaction",
  "recurring_transaction",
  "monthly_budget",
  "personal_goal",
  "habit",
  "place_visit",
  "trip",
  "vehicle",
  "type",
  "class",
] as const;

const PARENT_SCOPED_TABLES = [
  "habit_log",
  "trip_checklist_item",
  "trip_expense",
  "trip_expense_split",
  "trip_itinerary_day",
  "trip_itinerary_activity",
  "trip_milestone",
  "trip_member",
  "trip_invite",
  "trip_place_opinion",
  "vehicle_maintenance",
  "vehicle_fuel_log",
  "vehicle_document",
] as const;

describe("tenancy contract", () => {
  it("lista tabelas com user_id direto", () => {
    expect(OWNER_SCOPED_TABLES).toContain("movie");
    expect(OWNER_SCOPED_TABLES).toContain("transaction");
    expect(OWNER_SCOPED_TABLES.length).toBeGreaterThanOrEqual(9);
  });

  it("lista tabelas filhas com ownership via pai", () => {
    expect(PARENT_SCOPED_TABLES).toContain("habit_log");
    expect(PARENT_SCOPED_TABLES).toContain("vehicle_fuel_log");
    expect(PARENT_SCOPED_TABLES).toContain("trip_member");
    expect(PARENT_SCOPED_TABLES).toContain("trip_expense_split");
    expect(PARENT_SCOPED_TABLES).not.toContain("movie");
  });

  it("não mistura catálogo compartilhado com dados pessoais", () => {
    const sharedCatalog = ["nature"];
    for (const table of sharedCatalog) {
      expect(OWNER_SCOPED_TABLES).not.toContain(table);
      expect(PARENT_SCOPED_TABLES).not.toContain(table);
    }
    expect(OWNER_SCOPED_TABLES).toContain("type");
    expect(OWNER_SCOPED_TABLES).toContain("class");
  });
});
