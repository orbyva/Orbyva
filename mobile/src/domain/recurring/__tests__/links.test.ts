import { describe, expect, it } from "vitest";

import {
  isHttpLink,
  linkLabel,
  normalizeRecurringLink,
  RECURRING_LINK_HINT,
} from "@/domain/recurring/links";

describe("normalizeRecurringLink", () => {
  it("apara e devolve a URL", () => {
    expect(normalizeRecurringLink("  https://nubank.com.br/fatura  ")).toBe(
      "https://nubank.com.br/fatura"
    );
  });

  it.each(["", "   ", null, undefined])("vazio (%j) vira null", (raw) => {
    expect(normalizeRecurringLink(raw)).toBeNull();
  });
});

describe("isHttpLink", () => {
  it.each(["https://a.com", "http://a.com", "  HTTPS://A.COM "])("aceita %j", (raw) => {
    expect(isHttpLink(raw)).toBe(true);
  });

  it.each(["a.com", "www.a.com", "ftp://a.com", "javascript:alert(1)"])("recusa %j", (raw) => {
    expect(isHttpLink(raw)).toBe(false);
  });

  it("usa a mesma frase do web", () => {
    expect(RECURRING_LINK_HINT).toBe("Comece com https://");
  });
});

describe("linkLabel", () => {
  it("mostra só o domínio, sem www", () => {
    expect(linkLabel("https://www.nubank.com.br/fatura?x=1")).toBe("nubank.com.br");
    expect(linkLabel("http://sabesp.com.br#pagar")).toBe("sabesp.com.br");
  });
});
