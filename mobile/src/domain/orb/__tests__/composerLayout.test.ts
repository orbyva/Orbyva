import { describe, expect, it } from "vitest";

import { orbChatKeyboardInset } from "@/domain/orb/composerLayout";

describe("orbChatKeyboardInset", () => {
  it("sem teclado respeita safe area", () => {
    expect(orbChatKeyboardInset("ios", 0, 34)).toBe(34);
    expect(orbChatKeyboardInset("android", 0, 0)).toBe(8);
  });

  it("no iOS sobe o composer pela altura do teclado", () => {
    expect(orbChatKeyboardInset("ios", 336, 34)).toBe(336);
  });

  it("no Android não soma a altura (janela já resize)", () => {
    expect(orbChatKeyboardInset("android", 336, 34)).toBe(8);
  });
});
