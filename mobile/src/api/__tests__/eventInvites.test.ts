import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({
  db: {
    invites: [] as Row[],
    log: [] as string[],
    emailFails: false,
    insertError: null as { code?: string; message: string } | null,
    rpc: {} as Record<string, { data: unknown; error: { code?: string; message: string } | null }>,
  },
}));

vi.mock("@/lib/auth-user", () => ({ getCurrentUserId: vi.fn(async () => "host") }));

vi.mock("@/lib/supabase", () => {
  function table() {
    const filters: [string, unknown][] = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row | null = null;
    const matches = (row: Row) => filters.every(([k, v]) => row[k] === v);
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      eq: (k: string, v: unknown) => (filters.push([k, v]), builder),
      insert: (rows: Row[]) => ((op = "insert"), (payload = rows[0]), builder),
      update: (fields: Row) => ((op = "update"), (payload = fields), builder),
      single: async () => {
        if (db.insertError) return { data: null, error: db.insertError };
        const row: Row = { id: `i${db.invites.length + 1}`, ...payload };
        db.invites.push(row);
        db.log.push(`insert ${row.email ?? "link"}`);
        return { data: row, error: null };
      },
      maybeSingle: async () => ({ data: db.invites.find(matches) ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (op === "update") {
          db.log.push(`update ${JSON.stringify(payload)}`);
          for (const row of db.invites.filter(matches)) Object.assign(row, payload);
          return resolve({ error: null });
        }
        return resolve({ data: db.invites.filter(matches), error: null });
      },
    };
    void op;
    return builder;
  }
  return {
    supabase: {
      from: () => table(),
      functions: {
        invoke: async (name: string, opts: { body: Row }) => {
          db.log.push(`invoke ${name} ${opts.body.invite_id}`);
          return { error: db.emailFails ? { message: "smtp" } : null };
        },
      },
      rpc: async (name: string, args: Row) => {
        db.log.push(`rpc ${name} ${args.p_token}`);
        return db.rpc[name] ?? { data: null, error: null };
      },
    },
  };
});

import {
  acceptEventInvite,
  createEventInvite,
  getEventInviteByToken,
  listEventInvites,
  revokeEventInvite,
} from "@/api/tasks/eventInvites";

describe("convites de evento (mobile)", () => {
  beforeEach(() => {
    db.invites = [];
    db.log = [];
    db.emailFails = false;
    db.insertError = null;
    db.rpc = {};
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  });

  it("cria pendente com e-mail normalizado, token de 36 hex, validade de 14 dias e dispara o e-mail", async () => {
    const out = await createEventInvite("e1", "  Ana@Exemplo.COM ");
    expect(out).toMatchObject({ emailSent: true, resent: false });
    expect(out.invite).toMatchObject({
      event_id: "e1",
      email: "ana@exemplo.com",
      created_by: "host",
      status: "pending",
      expires_at: "2026-10-16T12:00:00.000Z",
    });
    expect(String(out.invite.token)).toMatch(/^[0-9a-f]{36}$/);
    expect(db.log).toEqual(["insert ana@exemplo.com", `invoke event-invite-email ${out.invite.id}`]);
  });

  it("convite só por link não dispara e-mail; e-mail que falha mantém o convite", async () => {
    const link = await createEventInvite("e1");
    expect(link).toMatchObject({ emailSent: false, resent: false });
    expect(db.log).toEqual(["insert link"]);

    db.emailFails = true;
    const failed = await createEventInvite("e1", "bia@x.com");
    expect(failed.emailSent).toBe(false);
    expect(await listEventInvites("e1")).toHaveLength(2);
  });

  it("e-mail já convidado vira reenvio: limpa email_sent_at e dispara de novo", async () => {
    db.invites = [
      { id: "i9", event_id: "e1", email: "ana@x.com", status: "pending", email_sent_at: "2026-10-01" },
    ];
    db.insertError = { code: "23505", message: "duplicate key event_invite_pending_email_idx" };
    const out = await createEventInvite("e1", "ana@x.com");
    expect(out).toMatchObject({ resent: true, emailSent: true, invite: { id: "i9" } });
    expect(db.invites[0].email_sent_at).toBeNull();
    expect(db.log).toEqual([`update {"email_sent_at":null}`, "invoke event-invite-email i9"]);
  });

  it("banco sem migration: criar avisa que ainda não está disponível", async () => {
    db.insertError = { code: "42P01", message: 'relation "event_invite" does not exist' };
    await expect(createEventInvite("e1")).rejects.toThrow("ainda não estão disponíveis");
  });

  it("listar sem a migration devolve vazio em vez de quebrar a tela", async () => {
    const { supabase } = await import("@/lib/supabase");
    const spy = vi.spyOn(supabase, "from").mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: null, error: { code: "PGRST205", message: "x" } }),
        }),
      }),
    } as never);
    expect(await listEventInvites("e1")).toEqual([]);
    spy.mockRestore();
  });

  it("revogar marca só o convite pedido", async () => {
    db.invites = [
      { id: "i1", event_id: "e1", status: "pending" },
      { id: "i2", event_id: "e1", status: "pending" },
    ];
    await revokeEventInvite("i2");
    expect(db.invites.map((i) => i.status)).toEqual(["pending", "revoked"]);
  });

  it("aceitar devolve o evento criado e repassa a mensagem amigável da RPC", async () => {
    db.rpc.accept_event_invite = { data: "ev-novo", error: null };
    expect(await acceptEventInvite("tok")).toBe("ev-novo");

    db.rpc.accept_event_invite = { data: null, error: { message: "Este convite expirou" } };
    await expect(acceptEventInvite("tok")).rejects.toThrow("Este convite expirou");

    db.rpc.accept_event_invite = { data: null, error: null };
    await expect(acceptEventInvite("tok")).rejects.toThrow("Convite inválido.");

    db.rpc.get_event_invite_by_token = { data: null, error: { code: "PGRST202", message: "x" } };
    await expect(getEventInviteByToken("tok")).rejects.toThrow("ainda não estão disponíveis");
  });
});
