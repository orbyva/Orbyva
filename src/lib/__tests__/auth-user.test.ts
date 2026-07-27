import { describe, expect, it } from "vitest";
import {
  AuthRequiredError,
  isAuthRequiredError,
} from "@/lib/auth-user";

describe("AuthRequiredError", () => {
  it("identifica erro de autenticação", () => {
    expect(isAuthRequiredError(new AuthRequiredError())).toBe(true);
    expect(isAuthRequiredError(new Error("Usuário não autenticado."))).toBe(
      true
    );
    expect(isAuthRequiredError(new Error("falha de rede"))).toBe(false);
  });
});
