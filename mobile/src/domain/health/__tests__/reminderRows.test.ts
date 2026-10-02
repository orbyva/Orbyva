import { describe, expect, it } from "vitest";

import { nextReminderLabel, reminderRows, REMINDER_ENTITY_TYPES } from "@/domain/health/reminder";
import type { ReminderPreference } from "@/types/health";

const pref = (over: Partial<ReminderPreference>): ReminderPreference =>
  ({
    id: "p1",
    user_id: "u1",
    entity_type: "water",
    frequency: "weekly",
    time_of_day: "14:30:00",
    enabled: true,
    last_notified_at: null,
    created_at: "2026-09-01T10:00:00",
    ...over,
  }) as ReminderPreference;

describe("reminderRows", () => {
  it("uma linha por tipo, na ordem fixa; tipo sem preferência vem desligado às 09:00 todo dia", () => {
    const rows = reminderRows([pref({ entity_type: "medication" })]);
    expect(rows.map((r) => r.entity_type)).toEqual(REMINDER_ENTITY_TYPES);
    expect(rows.find((r) => r.entity_type === "water")).toMatchObject({
      enabled: false,
      frequency: "daily",
      time_of_day: "09:00",
    });
    expect(rows.find((r) => r.entity_type === "medication")).toMatchObject({
      enabled: true,
      frequency: "weekly",
      time_of_day: "14:30",
    });
  });
});

describe("nextReminderLabel", () => {
  it("diário: hoje se o horário não passou, amanhã se passou", () => {
    const [row] = reminderRows([pref({ frequency: "daily", time_of_day: "09:00" })]);
    expect(nextReminderLabel(row, new Date(2026, 9, 2, 8, 0))).toBe("02/10/2026 09:00");
    expect(nextReminderLabel(row, new Date(2026, 9, 2, 10, 0))).toBe("03/10/2026 09:00");
  });

  it("desligado não tem próximo", () => {
    const [row] = reminderRows([]);
    expect(nextReminderLabel(row)).toBeNull();
  });
});
