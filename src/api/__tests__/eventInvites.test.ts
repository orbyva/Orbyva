import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptEventInvite,
  createEventInvite,
  eventInviteUrl,
  getEventInviteByToken,
  listEventInvites,
  normalizeInviteEmail,
  resendEventInvite,
  revokeEventInvite,
} from "@/api/tasks/eventInvites";

/**
 * Convites de evento (feature 076) contra um Supabase falso que **executa** os filtros e guarda o
 * que foi gravado.
 *
 * Os casos que importam aqui são todos de robustez, porque este é o único ponto do app que dispara
 * e-mail para terceiro: o convite não pode depender do e-mail ter saído, um banco sem as migrations
 * não pode estourar na cara do usuário, e convidar o mesmo e-mail duas vezes tem de virar reenvio,
 * não erro nem convite duplicado.
 */

type AnyRow = Record<string, unknown>;

const { store } = vi.hoisted(() => ({
  store: {
    rows: [] as AnyRow[],
    /** Setado: a próxima query em `event_invite` devolve este erro. */
    tableError: null as { code?: string; message: string } | null,
    /** Setado: a próxima chamada de RPC devolve este erro. */
    rpcError: null as { code?: string; message: string } | null,
    rpcResult: null as unknown,
    rpcCalls: [] as { name: string; args: unknown }[],
    invokeCalls: [] as { name: string; body: unknown }[],
    /** `false` = a edge function devolve erro; `"throw"` = a invocação estoura. */
    invokeOutcome: "ok" as "ok" | "error" | "throw",
    seq: 0,
  },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "host-1"),
}));

vi.mock("@/lib/supabase", () => {
  function makeBuilder() {
    const filters: [string, unknown][] = [];
    let inserted: AnyRow[] | null = null;
    let patch: AnyRow | null = null;

    const matching = () =>
      store.rows.filter((row) => filters.every(([col, val]) => row[col] === val));

    const settle = () => {
      if (store.tableError) {
        const error = store.tableError;
        store.tableError = null;
        return { data: null, error };
      }
      if (inserted) return { data: inserted, error: null };
      if (patch) {
        for (const row of matching()) Object.assign(row, patch);
        return { data: null, error: null };
      }
      return { data: matching(), error: null };
    };

    const builder: AnyRow = {
      select: () => builder,
      order: () => builder,
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      insert(rows: AnyRow[]) {
        const stamped: AnyRow[] = rows.map((row) => ({
          id: `invite-${++store.seq}`,
          created_at: new Date().toISOString(),
          accepted_by: null,
          accepted_event_id: null,
          email_sent_at: null,
          ...row,
        }));
        // Índice parcial `event_invite_pending_email_idx`: um pendente por (evento, e-mail).
        for (const row of stamped) {
          const clash = store.rows.some(
            (existing) =>
              existing.status === "pending" &&
              existing.email != null &&
              existing.event_id === row.event_id &&
              existing.email === row.email
          );
          if (clash) {
            store.tableError = {
              code: "23505",
              message:
                'duplicate key value violates unique constraint "event_invite_pending_email_idx"',
            };
            inserted = [];
            return builder;
          }
        }
        store.rows.push(...stamped);
        inserted = stamped;
        return builder;
      },
      update(values: AnyRow) {
        patch = values;
        return builder;
      },
      single: async () => {
        const out = settle();
        if (out.error) return out;
        return { data: (out.data as AnyRow[])[0] ?? null, error: null };
      },
      maybeSingle: async () => {
        const out = settle();
        if (out.error) return out;
        return { data: (out.data as AnyRow[])[0] ?? null, error: null };
      },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve(settle()).then(resolve);
      },
    };
    return builder;
  }

  return {
    supabase: {
      from: (table: string) => {
        if (table !== "event_invite") throw new Error(`tabela inesperada: ${table}`);
        return makeBuilder();
      },
      rpc: async (name: string, args: unknown) => {
        store.rpcCalls.push({ name, args });
        if (store.rpcError) {
          const error = store.rpcError;
          store.rpcError = null;
          return { data: null, error };
        }
        return { data: store.rpcResult, error: null };
      },
      functions: {
        invoke: async (name: string, opts: { body: unknown }) => {
          store.invokeCalls.push({ name, body: opts.body });
          if (store.invokeOutcome === "throw") throw new Error("rede caiu");
          if (store.invokeOutcome === "error") {
            return { data: null, error: { message: "Resend fora do ar" } };
          }
          return { data: { ok: true }, error: null };
        },
      },
    },
  };
});

beforeEach(() => {
  store.rows = [];
  store.tableError = null;
  store.rpcError = null;
  store.rpcResult = null;
  store.rpcCalls = [];
  store.invokeCalls = [];
  store.invokeOutcome = "ok";
  store.seq = 0;
});

describe("createEventInvite", () => {
  it("grava o convite com token aleatório, 14 dias de validade e status pendente", async () => {
    const antes = Date.now();
    const { invite, emailSent } = await createEventInvite("event-1", "Convidada@Exemplo.com ");

    expect(invite.event_id).toBe("event-1");
    expect(invite.status).toBe("pending");
    // E-mail normalizado: o casamento com o JWT no aceite é por `lower(trim(...))`.
    expect(invite.email).toBe("convidada@exemplo.com");
    expect(invite.token).toMatch(/^[0-9a-f]{36}$/);
    const dias = (new Date(invite.expires_at).getTime() - antes) / 86_400_000;
    expect(dias).toBeGreaterThan(13.9);
    expect(dias).toBeLessThan(14.1);
    expect(emailSent).toBe(true);
    expect(store.invokeCalls).toEqual([
      { name: "event-invite-email", body: { invite_id: invite.id } },
    ]);
  });

  it("dois convites seguidos usam tokens diferentes", async () => {
    const a = await createEventInvite("event-1", "a@exemplo.com");
    const b = await createEventInvite("event-1", "b@exemplo.com");
    expect(a.invite.token).not.toBe(b.invite.token);
  });

  it("convite sem e-mail (só link) não chama a função de e-mail", async () => {
    const { invite, emailSent } = await createEventInvite("event-1");
    expect(invite.email).toBeNull();
    expect(emailSent).toBe(false);
    expect(store.invokeCalls).toHaveLength(0);
  });

  it("falha do e-mail não derruba o convite — ele fica gravado e válido", async () => {
    store.invokeOutcome = "error";
    const { invite, emailSent } = await createEventInvite("event-1", "convidada@exemplo.com");

    expect(invite.status).toBe("pending");
    expect(emailSent).toBe(false);
    expect(store.rows).toHaveLength(1);
  });

  it("e-mail que estoura (rede caindo) também não derruba o convite", async () => {
    store.invokeOutcome = "throw";
    const { invite, emailSent } = await createEventInvite("event-1", "convidada@exemplo.com");

    expect(invite.id).toBeTruthy();
    expect(emailSent).toBe(false);
  });

  it("convidar o mesmo e-mail duas vezes reenvia o convite existente em vez de duplicar", async () => {
    const primeiro = await createEventInvite("event-1", "convidada@exemplo.com");
    store.invokeCalls = [];

    const segundo = await createEventInvite("event-1", "CONVIDADA@exemplo.com");

    expect(segundo.resent).toBe(true);
    expect(segundo.invite.id).toBe(primeiro.invite.id);
    expect(segundo.invite.token).toBe(primeiro.invite.token);
    expect(store.rows).toHaveLength(1);
    // Reenvio de verdade: limpou o carimbo e chamou a função de novo.
    expect(store.rows[0].email_sent_at).toBeNull();
    expect(store.invokeCalls).toEqual([
      { name: "event-invite-email", body: { invite_id: primeiro.invite.id } },
    ]);
  });

  it("banco sem a migration devolve mensagem amigável em vez de erro cru do Postgres", async () => {
    store.tableError = {
      code: "42P01",
      message: 'relation "public.event_invite" does not exist',
    };
    await expect(createEventInvite("event-1", "a@exemplo.com")).rejects.toThrow(
      /ainda não estão disponíveis/i
    );
  });
});

describe("listEventInvites / revokeEventInvite / resendEventInvite", () => {
  it("lista os convites do evento", async () => {
    await createEventInvite("event-1", "a@exemplo.com");
    await createEventInvite("event-2", "b@exemplo.com");

    const lista = await listEventInvites("event-1");
    expect(lista.map((i) => i.email)).toEqual(["a@exemplo.com"]);
  });

  it("banco sem a migration devolve lista vazia em vez de estourar a tela", async () => {
    store.tableError = { code: "PGRST205", message: "Could not find the table 'event_invite'" };
    await expect(listEventInvites("event-1")).resolves.toEqual([]);
  });

  it("revogar muda o status do convite", async () => {
    const { invite } = await createEventInvite("event-1", "a@exemplo.com");
    await revokeEventInvite(invite.id);
    expect(store.rows[0].status).toBe("revoked");
  });

  it("revogar libera reconvidar o mesmo e-mail (o índice parcial só vale para pendentes)", async () => {
    const primeiro = await createEventInvite("event-1", "a@exemplo.com");
    await revokeEventInvite(primeiro.invite.id);

    const segundo = await createEventInvite("event-1", "a@exemplo.com");
    expect(segundo.resent).toBe(false);
    expect(segundo.invite.id).not.toBe(primeiro.invite.id);
    expect(store.rows).toHaveLength(2);
  });

  it("reenviar limpa email_sent_at antes de chamar a função (senão ela ignora o pedido)", async () => {
    const { invite } = await createEventInvite("event-1", "a@exemplo.com");
    store.rows[0].email_sent_at = "2026-08-19T10:00:00.000Z";
    store.invokeCalls = [];

    await expect(resendEventInvite(invite.id)).resolves.toBe(true);
    expect(store.rows[0].email_sent_at).toBeNull();
    expect(store.invokeCalls).toHaveLength(1);
  });
});

describe("getEventInviteByToken", () => {
  it("devolve a pré-visualização da RPC", async () => {
    store.rpcResult = {
      id: "invite-1",
      event_id: "event-1",
      token: "tok",
      email: "convidada@exemplo.com",
      status: "pending",
      expires_at: "2026-09-01T00:00:00.000Z",
      event_title: "Reunião de kickoff",
      event_starts_at: "2026-09-01T13:00:00.000Z",
      event_ends_at: null,
      accepted_by_me: false,
    };

    const preview = await getEventInviteByToken("tok");
    expect(preview?.event_title).toBe("Reunião de kickoff");
    expect(store.rpcCalls).toEqual([
      { name: "get_event_invite_by_token", args: { p_token: "tok" } },
    ]);
  });

  it("token inexistente devolve null, sem erro", async () => {
    store.rpcResult = null;
    await expect(getEventInviteByToken("nao-existe")).resolves.toBeNull();
  });

  it("banco sem a RPC falha fechado, com mensagem amigável", async () => {
    store.rpcError = { code: "PGRST202", message: "function get_event_invite_by_token" };
    await expect(getEventInviteByToken("tok")).rejects.toThrow(/ainda não estão disponíveis/i);
  });
});

describe("acceptEventInvite", () => {
  it("devolve o id do evento criado na agenda de quem aceitou", async () => {
    store.rpcResult = "novo-evento-1";
    await expect(acceptEventInvite("tok")).resolves.toBe("novo-evento-1");
    expect(store.rpcCalls).toEqual([
      { name: "accept_event_invite", args: { p_token: "tok" } },
    ]);
  });

  it("propaga a mensagem da RPC, que já é amigável e em PT", async () => {
    store.rpcError = { message: "Este convite expirou" };
    await expect(acceptEventInvite("tok")).rejects.toThrow("Este convite expirou");
  });

  it("convite para outro e-mail chega com a mensagem certa", async () => {
    store.rpcError = { message: "Este convite é para outro e-mail" };
    await expect(acceptEventInvite("tok")).rejects.toThrow("Este convite é para outro e-mail");
  });

  it("banco sem a RPC devolve o fallback em vez do erro do PostgREST", async () => {
    store.rpcError = { code: "PGRST202", message: "Could not find the function" };
    await expect(acceptEventInvite("tok")).rejects.toThrow(/Tente mais tarde/i);
  });
});

describe("helpers", () => {
  it("normalizeInviteEmail apara e minúscula, e devolve null para vazio", () => {
    expect(normalizeInviteEmail("  Alguem@Exemplo.COM ")).toBe("alguem@exemplo.com");
    expect(normalizeInviteEmail("   ")).toBeNull();
    expect(normalizeInviteEmail(null)).toBeNull();
  });

  it("eventInviteUrl monta o link da rota de aceite, com o origin quando há window", () => {
    const origin = "https://orbyva.app";
    vi.stubGlobal("window", { location: { origin } });
    expect(eventInviteUrl("abc123")).toBe(`${origin}/events/invite/abc123`);
    vi.unstubAllGlobals();
  });

  it("sem window (SSR/teste em node) devolve o caminho relativo, sem estourar", () => {
    expect(eventInviteUrl("abc123")).toBe("/events/invite/abc123");
  });
});
