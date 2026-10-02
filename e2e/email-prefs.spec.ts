import { expect, test } from "@playwright/test";
import { e2eEnv, passwordGrant, rest } from "./helpers/auth";

/**
 * Feature 191 — preferências de e-mail gravam de verdade (RPC `update_email_prefs`) e a mesma
 * sessão continua sem conseguir mexer nas colunas de billing de `profiles`. Bate no PostgREST com
 * JWT real, sem navegador.
 */
const env = e2eEnv();

type Prefs = {
  email_digest_enabled: boolean;
  email_alerts_enabled: boolean;
  email_habit_reminder_enabled: boolean;
  email_unsubscribed_at: string | null;
  plan: string;
  stripe_customer_id: string | null;
};

const SELECT =
  "select=email_digest_enabled,email_alerts_enabled,email_habit_reminder_enabled,email_unsubscribed_at,plan,stripe_customer_id";

test.describe("preferências de e-mail", () => {
  test.skip(!env.email || !env.password, "Defina E2E_EMAIL e E2E_PASSWORD (e Supabase)");

  test("RPC grava, releitura confirma, billing intocado", async () => {
    const session = await passwordGrant(env.email!, env.password!);
    const token = session.access_token;
    const read = async () => {
      const r = await rest("profiles", token, {
        method: "GET",
        query: `${SELECT}&id=eq.${session.user.id}`,
      });
      expect(r.res.ok, r.text).toBeTruthy();
      return (r.json as Prefs[])[0];
    };

    const before = await read();
    const flipped = !before.email_alerts_enabled;

    try {
      const call = await rest("rpc/update_email_prefs", token, {
        method: "POST",
        body: JSON.stringify({ p_alerts: flipped }),
      });
      expect(call.res.ok, call.text).toBeTruthy();
      expect((call.json as Prefs[])[0].email_alerts_enabled).toBe(flipped);

      const after = await read();
      expect(after.email_alerts_enabled).toBe(flipped);
      expect(after.email_digest_enabled).toBe(before.email_digest_enabled);
      expect(after.plan).toBe(before.plan);
      expect(after.stripe_customer_id).toBe(before.stripe_customer_id);

      await rest("profiles", token, {
        method: "PATCH",
        query: `id=eq.${session.user.id}`,
        body: JSON.stringify({ plan: before.plan === "pro" ? "free" : "pro" }),
      });
      expect((await read()).plan).toBe(before.plan);
    } finally {
      await rest("rpc/update_email_prefs", token, {
        method: "POST",
        body: JSON.stringify({ p_alerts: before.email_alerts_enabled }),
      });
    }
  });
});
