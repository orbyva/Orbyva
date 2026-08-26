import { describe, expect, it } from "vitest";
import { postAuthRedirectUrl, safePostAuthPath } from "@/lib/authRedirect";

describe("safePostAuthPath", () => {
  it("aceita /ext e /home", () => {
    expect(safePostAuthPath("/ext")).toBe("/ext");
    expect(safePostAuthPath("/home")).toBe("/home");
  });

  it("rejeita destinos externos ou desconhecidos", () => {
    expect(safePostAuthPath("https://evil.test")).toBe("/home");
    expect(safePostAuthPath("//evil.test")).toBe("/home");
    expect(safePostAuthPath("/login")).toBe("/home");
    expect(safePostAuthPath("/account")).toBe("/home");
    expect(safePostAuthPath(null)).toBe("/home");
  });
});

describe("postAuthRedirectUrl", () => {
  it("monta URL absoluta no origin", () => {
    expect(postAuthRedirectUrl("https://orbyva.app", "/ext")).toBe(
      "https://orbyva.app/ext"
    );
  });
});
