/**
 * Ops interno, conceder Pro / estender trial / listar usuários.
 * NÃO é feature de produto. Allowlist: secret OPS_ADMIN_EMAILS (csv).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeadersForRequest } from "../_shared/cors.ts";

type Action =
  | "ping"
  | "list"
  | "lookup"
  | "grant_pro"
  | "revoke_pro"
  | "extend_trial";

type Body = {
  action?: Action;
  email?: string;
  days?: number;
};

type ProfileRow = {
  id: string;
  plan: string;
  subscription_status: string | null;
  current_period_end: string | null;
  created_at: string;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

const PROFILE_COLS =
  "id, plan, subscription_status, current_period_end, created_at, trial_ends_at, stripe_customer_id, stripe_subscription_id";

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersForRequest(req),
      "Content-Type": "application/json",
    },
  });
}

function parseAllowlist(): Set<string> {
  const raw = (Deno.env.get("OPS_ADMIN_EMAILS") ?? "").trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizeEmail(email: string | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  return e;
}

async function listAuthUsers(
  admin: ReturnType<typeof createClient>
): Promise<Array<{ id: string; email: string; created_at: string }>> {
  const out: Array<{ id: string; email: string; created_at: string }> = [];
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const batch = data?.users ?? [];
    for (const u of batch) {
      if (!u.email) continue;
      out.push({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
      });
    }
    if (batch.length < 200) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersForRequest(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const allowlist = parseAllowlist();

    if (allowlist.size === 0) {
      return json(
        req,
        {
          error:
            "OPS_ADMIN_EMAILS não configurado. Defina o secret com e-mails autorizados (csv).",
        },
        503
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(req, { error: "Não autenticado" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user?.email) {
      return json(req, { error: "Não autenticado" }, 401);
    }

    const actorEmail = user.email.toLowerCase();
    if (!allowlist.has(actorEmail)) {
      return json(req, { error: "Acesso negado" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }
    const action = (body.action ?? "ping") as Action;

    async function audit(
      act: string,
      targetUserId: string | null,
      targetEmail: string | null,
      detail: Record<string, unknown>
    ) {
      await admin.from("ops_audit_log").insert({
        actor_id: user!.id,
        actor_email: actorEmail,
        action: act,
        target_user_id: targetUserId,
        target_email: targetEmail,
        detail,
      });
    }

    if (action === "ping") {
      return json(req, { ok: true, actor: actorEmail });
    }

    if (action === "list") {
      const authUsers = await listAuthUsers(admin);
      const ids = authUsers.map((u) => u.id);
      const profileById = new Map<string, ProfileRow>();

      // .in() em lotes (PostgREST)
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data: profiles, error } = await admin
          .from("profiles")
          .select(PROFILE_COLS)
          .in("id", chunk);
        if (error) return json(req, { error: error.message }, 500);
        for (const p of (profiles ?? []) as ProfileRow[]) {
          profileById.set(p.id, p);
        }
      }

      const users = authUsers
        .map((u) => {
          const profile = profileById.get(u.id) ?? null;
          return {
            id: u.id,
            email: u.email,
            auth_created_at: u.created_at,
            plan: profile?.plan ?? "free",
            subscription_status: profile?.subscription_status ?? null,
            trial_ends_at: profile?.trial_ends_at ?? null,
            profile_created_at: profile?.created_at ?? null,
            stripe_subscription_id: profile?.stripe_subscription_id ?? null,
          };
        })
        .sort((a, b) => a.email.localeCompare(b.email, "pt-BR"));

      return json(req, { users, total: users.length });
    }

    const targetEmail = normalizeEmail(body.email);
    if (!targetEmail) {
      return json(req, { error: "Informe um e-mail válido" }, 400);
    }

    const { data: found, error: lookupError } = await admin.rpc(
      "ops_lookup_user_by_email",
      { p_email: targetEmail }
    );
    if (lookupError) {
      return json(req, { error: lookupError.message }, 500);
    }
    const row = Array.isArray(found) ? found[0] : found;
    if (!row?.user_id) {
      return json(req, { error: "Usuário não encontrado" }, 404);
    }

    const targetId = String(row.user_id);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("id", targetId)
      .maybeSingle();

    if (profileError) {
      return json(req, { error: profileError.message }, 500);
    }

    if (action === "lookup") {
      return json(req, {
        user: {
          id: targetId,
          email: row.email ?? targetEmail,
          auth_created_at: row.auth_created_at,
        },
        profile: profile ?? null,
      });
    }

    if (action === "grant_pro") {
      const { data: updated, error } = await admin
        .from("profiles")
        .upsert(
          {
            id: targetId,
            plan: "pro",
            subscription_status: "active",
          },
          { onConflict: "id" }
        )
        .select(
          "id, plan, subscription_status, current_period_end, created_at, trial_ends_at"
        )
        .single();
      if (error) return json(req, { error: error.message }, 500);
      await audit("grant_pro", targetId, targetEmail, { before: profile });
      return json(req, { ok: true, profile: updated });
    }

    if (action === "revoke_pro") {
      const { data: updated, error } = await admin
        .from("profiles")
        .update({
          plan: "free",
          subscription_status: null,
        })
        .eq("id", targetId)
        .select(
          "id, plan, subscription_status, current_period_end, created_at, trial_ends_at"
        )
        .single();
      if (error) return json(req, { error: error.message }, 500);
      await audit("revoke_pro", targetId, targetEmail, { before: profile });
      return json(req, { ok: true, profile: updated });
    }

    if (action === "extend_trial") {
      const days = Math.floor(Number(body.days));
      if (!Number.isFinite(days) || days < 1 || days > 365) {
        return json(req, { error: "days deve ser entre 1 e 365" }, 400);
      }

      const now = new Date();
      const currentEnd = profile?.trial_ends_at
        ? new Date(profile.trial_ends_at)
        : profile?.created_at
          ? new Date(
              new Date(profile.created_at).getTime() + 7 * 24 * 60 * 60 * 1000
            )
          : now;
      const base = currentEnd.getTime() > now.getTime() ? currentEnd : now;
      const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

      const { data: updated, error } = await admin
        .from("profiles")
        .upsert(
          {
            id: targetId,
            plan: profile?.plan === "pro" ? "pro" : "free",
            trial_ends_at: next.toISOString(),
          },
          { onConflict: "id" }
        )
        .select(
          "id, plan, subscription_status, current_period_end, created_at, trial_ends_at"
        )
        .single();
      if (error) return json(req, { error: error.message }, 500);
      await audit("extend_trial", targetId, targetEmail, {
        days,
        before: profile,
        trial_ends_at: next.toISOString(),
      });
      return json(req, { ok: true, profile: updated });
    }

    return json(req, { error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(req, { error: message }, 500);
  }
});
