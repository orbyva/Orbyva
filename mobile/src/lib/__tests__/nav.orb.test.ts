import { describe, expect, it } from "vitest";

import { quickAddActionsForPath } from "@/lib/nav";

describe("quickAddActionsForPath · Orb", () => {
  it("esconde quick add na Orb", () => {
    expect(quickAddActionsForPath("/orb")).toEqual([]);
  });
});
