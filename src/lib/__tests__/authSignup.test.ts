import { describe, expect, it } from "vitest";
import {
  EXISTING_ACCOUNT_SIGNUP_MESSAGE,
  isDuplicateEmailSignUp,
} from "@/lib/authSignup";

describe("isDuplicateEmailSignUp", () => {
  it("detecta o caso ofuscado do Supabase (sem sessão + identities vazias)", () => {
    expect(
      isDuplicateEmailSignUp({
        user: { identities: [] },
        session: null,
      })
    ).toBe(true);
    expect(EXISTING_ACCOUNT_SIGNUP_MESSAGE).toMatch(/já existe/i);
  });

  it("não marca signup novo que só precisa confirmar e-mail", () => {
    expect(
      isDuplicateEmailSignUp({
        user: { identities: [{ id: "1" }] },
        session: null,
      })
    ).toBe(false);
  });

  it("não marca quando já entrou (sessão criada)", () => {
    expect(
      isDuplicateEmailSignUp({
        user: { identities: [] },
        session: { access_token: "x" },
      })
    ).toBe(false);
  });
});
