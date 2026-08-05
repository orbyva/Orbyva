import { describe, expect, it } from "vitest";
import { isTripFinished } from "@/domain/travel";

describe("isTripFinished", () => {
  it("encerra quando a data final já passou", () => {
    expect(
      isTripFinished({
        endDate: "2026-08-04",
        status: "ongoing",
        todayIso: "2026-08-05",
      })
    ).toBe(true);
  });

  it("mantém ativa no último dia e nos dias futuros", () => {
    expect(
      isTripFinished({
        endDate: "2026-08-05",
        status: "ongoing",
        todayIso: "2026-08-05",
      })
    ).toBe(false);
    expect(
      isTripFinished({
        endDate: "2026-08-10",
        status: "upcoming",
        todayIso: "2026-08-05",
      })
    ).toBe(false);
  });

  it("encerra por status mesmo com data futura", () => {
    expect(
      isTripFinished({
        endDate: "2026-09-01",
        status: "completed",
        todayIso: "2026-08-05",
      })
    ).toBe(true);
    expect(
      isTripFinished({
        endDate: "2026-09-01",
        status: "cancelled",
        todayIso: "2026-08-05",
      })
    ).toBe(true);
  });

  it("sem data final e sem status encerrado, segue ativa", () => {
    expect(
      isTripFinished({ endDate: null, status: "planning", todayIso: "2026-08-05" })
    ).toBe(false);
  });
});
