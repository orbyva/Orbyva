import { describe, expect, it } from "vitest";

import { Colors } from "../../../constants/theme";
import { PRIORITY_LABELS, PRIORITY_TONE } from "../priority";

describe("PRIORITY_TONE", () => {
  it("cobre toda prioridade que tem rótulo", () => {
    expect(Object.keys(PRIORITY_TONE).sort()).toEqual(Object.keys(PRIORITY_LABELS).sort());
  });

  it("alta destrutiva, média em alerta, baixa no primary", () => {
    expect(PRIORITY_TONE).toEqual({ high: "destructive", medium: "warning", low: "primary" });
  });

  it.each(["light", "dark"] as const)("todo token existe no tema %s", (scheme) => {
    for (const tone of Object.values(PRIORITY_TONE)) {
      expect(Colors[scheme][tone]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
