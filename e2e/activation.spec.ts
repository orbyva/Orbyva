import { expect, test } from "@playwright/test";
import {
  dismissOnboardingIfPresent,
  e2eEnv,
  rest,
  signInViaSupabaseApi,
} from "./helpers/auth";

/**
 * Ativação completa: login → 1ª tx → orçamento.
 * Cria dados via REST (estável no CI) e valida na UI.
 * Requer tipos/classes no usuário E2E (onboarding dimensions ou seed).
 */
const env = e2eEnv();

async function pickClassId(token: string): Promise<number | null> {
  const { res, json } = await rest("class", token, {
    method: "GET",
    query: "select=id&limit=1",
  });
  if (!res.ok) return null;
  const rows = json as { id: number }[];
  return rows[0]?.id ?? null;
}

async function pickTypeId(token: string): Promise<number | null> {
  const { res, json } = await rest("type", token, {
    method: "GET",
    query: "select=id&limit=1",
  });
  if (!res.ok) return null;
  const rows = json as { id: number }[];
  return rows[0]?.id ?? null;
}

test.describe("ativação completa", () => {
  test.skip(
    !env.hasAuth,
    "Defina E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY"
  );

  test("login → cria tx + orçamento → vê no app", async ({ page }) => {
    const session = await signInViaSupabaseApi(page);
    const token = session.access_token;
    const userId = session.user.id;
    const stamp = `E2E ${Date.now()}`;

    const classId = await pickClassId(token);
    const typeId = await pickTypeId(token);
    test.skip(
      !classId || !typeId,
      "Usuário E2E sem dimensões — complete o onboarding uma vez ou rode seed"
    );

    const tx = await rest("transaction", token, {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        class_id: classId,
        value: 42.5,
        description: stamp,
        transaction_at: new Date().toISOString().slice(0, 10),
      }),
    });
    expect(tx.res.ok, tx.text).toBeTruthy();

    const month = new Date().toISOString().slice(0, 7) + "-01";
    const budget = await rest("monthly_budget", token, {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        type_id: typeId,
        class_id: null,
        budget_month: month,
        planned_value: 500,
      }),
    });
    expect(budget.res.ok, budget.text).toBeTruthy();

    await page.goto("/home");
    await dismissOnboardingIfPresent(page);
    await expect(page).toHaveURL(/\/(home|finance|account)/, {
      timeout: 30_000,
    });

    await page.goto("/finance/transactions");
    await expect(page.getByText(stamp).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.goto("/finance/budget");
    await expect(page.locator("body")).toContainText(/Orçamento|Despesa|500/i);
  });
});
