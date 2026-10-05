import { describe, expect, it } from "vitest";

import { Colors } from "../../../constants/theme";
import { calendarItemColor, type CalendarItem } from "../calendar";

const task = (status: string) => ({ kind: "task", task: { status } }) as unknown as CalendarItem;
const event = (project_id: string | null) =>
  ({ kind: "event", event: { project_id } }) as unknown as CalendarItem;

describe("calendarItemColor", () => {
  it.each(["light", "dark"] as const)("tarefa segue o token do status no tema %s", (scheme) => {
    const theme = Colors[scheme];
    expect(calendarItemColor(task("todo"), [], theme)).toBe(theme.mutedForeground);
    expect(calendarItemColor(task("doing"), [], theme)).toBe(theme.primary);
    expect(calendarItemColor(task("done"), [], theme)).toBe(theme.success);
    expect(calendarItemColor(task("outro"), [], theme)).toBe(theme.mutedForeground);
  });

  it("evento usa a cor escolhida para o projeto", () => {
    const projects = [{ id: "p1", color: "#123ABC" }];
    expect(calendarItemColor(event("p1"), projects, Colors.light)).toBe("#123ABC");
  });

  it("evento sem projeto ou projeto sem cor cai em chart2", () => {
    const projects = [{ id: "p1", color: null }];
    expect(calendarItemColor(event("p1"), projects, Colors.dark)).toBe(Colors.dark.chart2);
    expect(calendarItemColor(event(null), projects, Colors.light)).toBe(Colors.light.chart2);
  });
});
