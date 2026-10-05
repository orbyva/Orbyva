import { describe, expect, it } from "vitest";
import {
  RECURRING_LINK_HINT,
  isHttpLink,
  normalizeRecurringLink,
} from "@/domain/recurring";

/**
 * Regra pura do link da recorrência (feature 206). Sem navegador: estas duas funções são o que o
 * `RecurringFormDialog` chama no submit e o que decide o que chega ao banco, então é aqui que o
 * "apagou o link vira `null`" e o "sem protocolo não passa" ficam fixados.
 */

describe("normalizeRecurringLink", () => {
  it("faz trim e preserva a URL íntegra no caso bom", () => {
    expect(normalizeRecurringLink("  https://nubank.com.br/pagar  ")).toBe(
      "https://nubank.com.br/pagar"
    );
    expect(
      normalizeRecurringLink("https://www.enel.com.br/pagar?conta=123#boleto")
    ).toBe("https://www.enel.com.br/pagar?conta=123#boleto");
  });

  it("devolve null para vazio, só espaços, null e undefined", () => {
    // É o caso que faz "apagou o link" chegar como `null` no payload de `updateRecurringApi`,
    // em vez de string vazia, e o que evita linha legada com `\"   \"` virando ícone na lista.
    expect(normalizeRecurringLink("")).toBeNull();
    expect(normalizeRecurringLink("   ")).toBeNull();
    expect(normalizeRecurringLink(null)).toBeNull();
    expect(normalizeRecurringLink(undefined)).toBeNull();
  });
});

describe("isHttpLink", () => {
  it("aceita http:// e https://", () => {
    expect(isHttpLink("https://nubank.com.br")).toBe(true);
    expect(isHttpLink("http://nubank.com.br")).toBe(true);
    expect(isHttpLink("HTTPS://NUBANK.COM.BR")).toBe(true);
  });

  it("recusa URL sem protocolo, outro protocolo e string vazia", () => {
    expect(isHttpLink("nubank.com.br")).toBe(false);
    expect(isHttpLink("ftp://x")).toBe(false);
    expect(isHttpLink("javascript:alert(1)")).toBe(false);
    expect(isHttpLink("")).toBe(false);
    expect(isHttpLink("   ")).toBe(false);
  });
});

describe("RECURRING_LINK_HINT", () => {
  it("é a mesma frase já usada no app, sem importar o módulo de tarefas", () => {
    expect(RECURRING_LINK_HINT).toBe("Comece com https://");
  });
});
