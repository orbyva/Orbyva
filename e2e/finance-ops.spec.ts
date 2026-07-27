import { expect, test } from "@playwright/test";
import {
  dismissOnboardingIfPresent,
  e2eEnv,
  rest,
  signInViaSupabaseApi,
} from "./helpers/auth";

const env = e2eEnv();

async function pickClassId(token: string): Promise<number | null> {
  const { res, json } = await rest("class", token, {
    method: "GET",
    query: "select=id&limit=1",
  });
  if (!res.ok) return null;
  return (json as { id: number }[])[0]?.id ?? null;
}

async function pickTypeId(token: string): Promise<number | null> {
  const { res, json } = await rest("type", token, {
    method: "GET",
    query: "select=id&limit=1",
  });
  if (!res.ok) return null;
  return (json as { id: number }[])[0]?.id ?? null;
}

test.describe("orçamento e parcelas", () => {
  test.skip(!env.hasAuth, "Credenciais E2E ausentes");

  test("vê orçamento do mês na UI", async ({ page }) => {
    const session = await signInViaSupabaseApi(page);
    const typeId = await pickTypeId(session.access_token);
    test.skip(!typeId, "Sem tipos/dimensões no usuário E2E");

    const month = new Date().toISOString().slice(0, 7) + "-01";
    const stamp = 777;
    await rest("monthly_budget", session.access_token, {
      method: "POST",
      body: JSON.stringify({
        user_id: session.user.id,
        type_id: typeId,
        class_id: null,
        budget_month: month,
        planned_value: stamp,
      }),
    });

    await page.goto("/finance/budget");
    await dismissOnboardingIfPresent(page);
    await expect(page.locator("body")).toContainText(/Orçamento|orçamento/i, {
      timeout: 20_000,
    });
    await expect(page.locator("body")).toContainText(/777/);
  });

  test("lista parcela/recorrência criada via API", async ({ page }) => {
    const session = await signInViaSupabaseApi(page);
    const classId = await pickClassId(session.access_token);
    test.skip(!classId, "Sem classes no usuário E2E");

    const stamp = `E2E-REC-${Date.now()}`;
    const created = await rest("recurring_transaction", session.access_token, {
      method: "POST",
      body: JSON.stringify({
        user_id: session.user.id,
        class_id: classId,
        value: 99.9,
        description: stamp,
        frequency: "Mensal",
        validity: null,
        due_day: 10,
        installment_count: 3,
        payment_start_date: new Date().toISOString().slice(0, 10),
        status: true,
      }),
    });
    expect(created.res.ok, created.text).toBeTruthy();

    await page.goto("/finance/recurring");
    await dismissOnboardingIfPresent(page);
    await expect(page.getByText(stamp).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("exclusão e export", () => {
  test.skip(!env.hasAuth, "Credenciais E2E ausentes");

  test("exclui transação e some da lista", async ({ page }) => {
    const session = await signInViaSupabaseApi(page);
    const classId = await pickClassId(session.access_token);
    test.skip(!classId, "Sem classes no usuário E2E");

    const stamp = `E2E-DEL-${Date.now()}`;
    const tx = await rest("transaction", session.access_token, {
      method: "POST",
      body: JSON.stringify({
        user_id: session.user.id,
        class_id: classId,
        value: 12.34,
        description: stamp,
        transaction_at: new Date().toISOString().slice(0, 10),
      }),
    });
    expect(tx.res.ok, tx.text).toBeTruthy();
    const id = (tx.json as { id: number }[])[0]?.id;
    expect(id).toBeTruthy();

    await page.goto("/finance/transactions");
    await dismissOnboardingIfPresent(page);
    await expect(page.getByText(stamp).first()).toBeVisible({
      timeout: 20_000,
    });

    const del = await rest("transaction", session.access_token, {
      method: "DELETE",
      query: `id=eq.${id}`,
    });
    expect(del.res.ok, del.text).toBeTruthy();

    await page.reload();
    await expect(page.getByText(stamp)).toHaveCount(0, { timeout: 15_000 });
  });

  test("Conta expõe export CSV", async ({ page }) => {
    await signInViaSupabaseApi(page);
    await page.goto("/account");
    await dismissOnboardingIfPresent(page);
    await expect(
      page.getByRole("heading", { name: /Exportar dados/i })
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: "Finanças", exact: true })
    ).toBeVisible({ timeout: 10_000 });
  });
});
