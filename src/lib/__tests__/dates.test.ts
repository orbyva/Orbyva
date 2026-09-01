import { describe, expect, it } from "vitest";
import { formatLocalIsoDate, formatLocalIsoDateTime } from "@/lib/dates";

describe("formatLocalIsoDateTime", () => {
  it("junta a data civil com o horário HH:mm", () => {
    const date = new Date(2026, 8, 1, 15, 45);
    expect(formatLocalIsoDate(date)).toBe("2026-09-01");
    expect(formatLocalIsoDateTime(date, "10:00")).toBe("2026-09-01T10:00");
  });

  it("horário vazio cai em 00:00, sem inventar fuso", () => {
    expect(formatLocalIsoDateTime(new Date(2026, 0, 2), "")).toBe("2026-01-02T00:00");
  });
});
