import { describe, expect, it } from "vitest";
import { planItineraryDateSync } from "@/domain/travel";

describe("planItineraryDateSync", () => {
  it("remove dias antes do novo início e renumerar", () => {
    const existing = [
      { id: "a", date: "2026-08-01", day_number: 1, title: "Dia 1" },
      { id: "b", date: "2026-08-02", day_number: 2, title: "Dia 2" },
      { id: "c", date: "2026-08-07", day_number: 7, title: "Dia 7" },
      { id: "d", date: "2026-08-08", day_number: 8, title: "Museu" },
    ];
    const plan = planItineraryDateSync(
      "t1",
      "2026-08-07",
      "2026-08-08",
      existing
    );
    expect(plan.deleteIds.sort()).toEqual(["a", "b"]);
    expect(plan.insert).toHaveLength(0);
    expect(plan.updates).toEqual(
      expect.arrayContaining([
        { id: "c", day_number: 1, title: "Dia 1" },
        { id: "d", day_number: 2, title: "Museu" },
      ])
    );
  });

  it("cria dias faltantes ao antecipar o início", () => {
    const existing = [
      { id: "c", date: "2026-08-07", day_number: 1, title: "Dia 1" },
    ];
    const plan = planItineraryDateSync(
      "t1",
      "2026-08-05",
      "2026-08-07",
      existing
    );
    expect(plan.deleteIds).toEqual([]);
    expect(plan.insert.map((d) => d.date)).toEqual([
      "2026-08-05",
      "2026-08-06",
    ]);
    expect(plan.updates).toEqual([
      { id: "c", day_number: 3, title: "Dia 3" },
    ]);
  });

  it("remove dias após o novo fim", () => {
    const existing = [
      { id: "a", date: "2026-08-01", day_number: 1, title: "Dia 1" },
      { id: "b", date: "2026-08-10", day_number: 10, title: "Dia 10" },
    ];
    const plan = planItineraryDateSync(
      "t1",
      "2026-08-01",
      "2026-08-05",
      existing
    );
    expect(plan.deleteIds).toEqual(["b"]);
    expect(plan.insert.map((d) => d.date)).toEqual([
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });
});
