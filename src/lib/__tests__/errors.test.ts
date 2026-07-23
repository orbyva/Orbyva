import { describe, expect, it } from "vitest";
import { getErrorMessage } from "@/lib/errors";

describe("getErrorMessage", () => {
  it("traduz acesso expirado / 42501", () => {
    expect(getErrorMessage(new Error("Acesso expirado. Assine o Pro"))).toMatch(
      /teste acabou|Pro/i
    );
    expect(getErrorMessage({ message: "42501" })).toMatch(/teste acabou|Pro/i);
  });

  it("preserva mensagens comuns", () => {
    expect(getErrorMessage(new Error("Falhou ao salvar"))).toBe(
      "Falhou ao salvar"
    );
  });
});
