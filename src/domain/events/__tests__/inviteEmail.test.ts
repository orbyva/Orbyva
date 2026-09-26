import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  eventTitleForEmail,
  formatEventWhen,
  inviteEmailSubject,
  shouldSendInviteEmail,
  toBase64Utf8,
} from "@/domain/events/inviteEmail";
import { buildEventIcs } from "@/domain/events/ics";

/**
 * Este é o único ponto do app que manda e-mail para terceiro, então o que decide **se** o e-mail sai
 * é lógica de primeira classe: convite revogado, expirado ou já enviado não pode disparar nada, e
 * um reenvio legítimo tem de passar. A Edge Function (Deno) só orquestra I/O em cima disto.
 */

const agora = new Date("2026-08-20T12:00:00.000Z");

function convite(overrides: Partial<Parameters<typeof shouldSendInviteEmail>[0]> = {}) {
  return {
    status: "pending",
    email: "convidada@exemplo.com",
    expires_at: "2026-09-03T12:00:00.000Z",
    email_sent_at: null,
    ...overrides,
  };
}

describe("shouldSendInviteEmail", () => {
  it("convite pendente, com e-mail, dentro do prazo e nunca enviado: manda", () => {
    expect(shouldSendInviteEmail(convite(), agora)).toEqual({ send: true });
  });

  it("convite revogado nunca vira e-mail", () => {
    expect(shouldSendInviteEmail(convite({ status: "revoked" }), agora)).toEqual({
      send: false,
      reason: "not_pending",
    });
  });

  it("convite já aceito nunca vira e-mail", () => {
    expect(shouldSendInviteEmail(convite({ status: "accepted" }), agora)).toEqual({
      send: false,
      reason: "not_pending",
    });
  });

  it("revogado ganha de tudo: nem com o carimbo limpo e prazo aberto dispara", () => {
    expect(
      shouldSendInviteEmail(
        convite({ status: "revoked", email_sent_at: null }),
        agora
      )
    ).toEqual({ send: false, reason: "not_pending" });
  });

  it("convite só-link (sem e-mail) não dispara nada", () => {
    expect(shouldSendInviteEmail(convite({ email: null }), agora)).toEqual({
      send: false,
      reason: "no_email",
    });
    expect(shouldSendInviteEmail(convite({ email: "   " }), agora)).toEqual({
      send: false,
      reason: "no_email",
    });
  });

  it("convite expirado não dispara, mesmo pendente", () => {
    expect(
      shouldSendInviteEmail(convite({ expires_at: "2026-08-19T12:00:00.000Z" }), agora)
    ).toEqual({ send: false, reason: "expired" });
  });

  it("convite que já teve e-mail enviado é ignorado (idempotência)", () => {
    expect(
      shouldSendInviteEmail(convite({ email_sent_at: "2026-08-20T09:00:00.000Z" }), agora)
    ).toEqual({ send: false, reason: "already_sent" });
  });

  it("reenvio legítimo (carimbo limpo pelo app) volta a passar", () => {
    expect(shouldSendInviteEmail(convite({ email_sent_at: null }), agora)).toEqual({
      send: true,
    });
  });

  it("sem expires_at, não inventa expiração", () => {
    expect(shouldSendInviteEmail(convite({ expires_at: null }), agora)).toEqual({
      send: true,
    });
  });
});

describe("escapeHtml", () => {
  it("neutraliza HTML vindo do nome de quem convida", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
  });

  it("escapa o & antes dos outros, sem escape duplo", () => {
    expect(escapeHtml("Ana & <b>")).toBe("Ana &amp; &lt;b&gt;");
  });

  it("não mexe em acentos", () => {
    expect(escapeHtml("Reunião de ação")).toBe("Reunião de ação");
  });
});

describe("toBase64Utf8", () => {
  it("codifica ASCII", () => {
    expect(toBase64Utf8("hello")).toBe("aGVsbG8=");
  });

  it("codifica acentos sem estourar (btoa cru quebraria)", () => {
    const original = "Reunião de ação — coração";
    const decodificado = new TextDecoder().decode(
      Uint8Array.from(atob(toBase64Utf8(original)), (c) => c.charCodeAt(0))
    );
    expect(decodificado).toBe(original);
  });

  it("o .ics inteiro sobrevive à volta pelo base64 — é assim que ele viaja no anexo", () => {
    const ics = buildEventIcs({
      uid: "event-1@orbyva.app",
      title: "Reunião: pauta, riscos; ação",
      startsAt: "2026-09-01T13:00:00.000Z",
      endsAt: null,
      now: new Date("2026-08-20T09:30:00.000Z"),
    });
    const volta = new TextDecoder().decode(
      Uint8Array.from(atob(toBase64Utf8(ics)), (c) => c.charCodeAt(0))
    );
    expect(volta).toBe(ics);
    expect(volta).toContain("SUMMARY:Reunião: pauta\\, riscos\\; ação");
    expect(volta).toContain("DURATION:PT1H");
  });
});

describe("formatEventWhen", () => {
  it("formata em pt-BR no fuso de São Paulo (13:00 UTC vira 10:00)", () => {
    const texto = formatEventWhen("2026-09-01T13:00:00.000Z");
    expect(texto).toContain("10:00");
    expect(texto.toLowerCase()).toContain("setembro");
  });

  it("data inválida devolve a string original em vez de quebrar o e-mail", () => {
    expect(formatEventWhen("não é data")).toBe("não é data");
  });
});

describe("assunto e título", () => {
  it("assunto diz quem convidou e para o quê", () => {
    expect(inviteEmailSubject("Ana", "Reunião de kickoff")).toBe(
      "Ana te convidou para Reunião de kickoff"
    );
  });

  it("evento sem título usável ganha um rótulo genérico, nunca vazio", () => {
    expect(eventTitleForEmail("  ")).toBe("um evento no Orbyva");
    expect(eventTitleForEmail(null)).toBe("um evento no Orbyva");
    expect(eventTitleForEmail("Café")).toBe("Café");
  });
});
