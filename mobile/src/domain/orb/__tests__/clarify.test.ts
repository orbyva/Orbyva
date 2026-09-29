import { describe, expect, it } from "vitest";

import { isOrbAskUser, ORB_ASK_USER_TOOL_NAME } from "@/domain/orb/clarify";

describe("clarify", () => {
  it("reconhece ask_user tipado", () => {
    expect(ORB_ASK_USER_TOOL_NAME).toBe("ask_user");
    expect(
      isOrbAskUser({
        status: "awaiting_user",
        question: "Qual horário?",
        suggestions: ["20:00", "21:00"],
      })
    ).toBe(true);
    expect(isOrbAskUser({ status: "awaiting_user", question: "", suggestions: [] })).toBe(
      false
    );
  });
});
