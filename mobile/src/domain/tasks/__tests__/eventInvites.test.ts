import { describe, expect, it } from "vitest";

import {
  eventInviteState,
  parseEventInviteToken,
  validateInviteEmail,
} from "@/domain/tasks/eventInvites";
import type { EventInvitePreview } from "@/types/tasks";

const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f901234";
const NOW = new Date("2026-10-02T12:00:00Z").getTime();

function preview(over: Partial<EventInvitePreview> = {}): EventInvitePreview {
  return {
    id: "i1",
    event_id: "e1",
    token: TOKEN,
    email: null,
    status: "pending",
    expires_at: "2026-10-10T00:00:00Z",
    event_title: "Churrasco",
    event_starts_at: "2026-10-05T18:00:00Z",
    event_ends_at: null,
    accepted_by_me: false,
    ...over,
  };
}

describe("eventInviteState", () => {
  it("cada motivo de recusa tem título próprio", () => {
    expect(eventInviteState(null, "a@b.com", NOW)).toMatchObject({ kind: "error", title: "Convite não encontrado" });
    expect(eventInviteState(preview({ status: "revoked" }), null, NOW)).toMatchObject({ title: "Convite cancelado" });
    expect(eventInviteState(preview({ status: "accepted" }), null, NOW)).toMatchObject({ title: "Convite já utilizado" });
    expect(eventInviteState(preview({ status: "expired" }), null, NOW)).toMatchObject({ title: "Convite expirado" });
    expect(eventInviteState(preview({ expires_at: "2026-10-01T00:00:00Z" }), null, NOW)).toMatchObject({
      title: "Convite expirado",
    });
  });

  it("aceito por mim, para outro e-mail, e pronto (convite por link ou e-mail igual sem caixa)", () => {
    expect(eventInviteState(preview({ status: "accepted", accepted_by_me: true }), null, NOW).kind).toBe(
      "accepted-by-me"
    );
    expect(eventInviteState(preview({ email: "ana@x.com" }), "bia@x.com", NOW).kind).toBe("other-email");
    expect(eventInviteState(preview({ email: "Ana@X.com" }), " ana@x.com", NOW).kind).toBe("ready");
    expect(eventInviteState(preview(), "qualquer@x.com", NOW).kind).toBe("ready");
  });
});

describe("parseEventInviteToken", () => {
  it("aceita token cru, link da web e link do app; recusa o resto", () => {
    expect(parseEventInviteToken(` ${TOKEN.toUpperCase()} `)).toBe(TOKEN);
    expect(parseEventInviteToken(`https://orbyva.app/events/invite/${TOKEN}`)).toBe(TOKEN);
    expect(parseEventInviteToken(`orbyva://tasks/event-invite/${TOKEN}?x=1`)).toBe(TOKEN);
    expect(parseEventInviteToken("https://orbyva.app/travel/invite/zzz")).toBeNull();
    expect(parseEventInviteToken("abc")).toBeNull();
    expect(parseEventInviteToken("")).toBeNull();
  });
});

describe("validateInviteEmail", () => {
  it("diz o que fazer", () => {
    expect(validateInviteEmail(" ")).toBe("Escreva o e-mail de quem você quer convidar.");
    expect(validateInviteEmail("ana@x")).toBe("Use um e-mail completo, como nome@dominio.com.");
    expect(validateInviteEmail("ana@x.com")).toBeNull();
  });
});
