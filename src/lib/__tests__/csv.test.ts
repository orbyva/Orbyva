import { describe, expect, it } from "vitest";
import { rowsToCsv } from "@/lib/csv";

describe("rowsToCsv", () => {
  it("escapa vírgulas e aspas", () => {
    const csv = rowsToCsv(
      ["a", "b"],
      [
        ["ok", 'diz "oi"'],
        ["um, dois", "fim"],
      ]
    );
    expect(csv).toContain('"diz ""oi"""');
    expect(csv).toContain('"um, dois"');
  });
});
