import { expect, test } from "@playwright/test";
import { e2eEnv, passwordGrant, rest } from "./helpers/auth";

/**
 * Isolamento RLS: user B não lê/escreve dados do user A.
 * Opcional: E2E_EMAIL_B + E2E_PASSWORD_B (segunda conta confirmada).
 */
const env = e2eEnv();

test.describe("RLS 2 usuários", () => {
  test.skip(
    !env.hasTwoUsers,
    "Defina E2E_EMAIL_B e E2E_PASSWORD_B (além de E2E_EMAIL/PASSWORD e Supabase)"
  );

  test("transaction e monthly_budget isolados", async () => {
    const a = await passwordGrant(env.email!, env.password!);
    const b = await passwordGrant(env.emailB!, env.passwordB!);

    const classA = await rest("class", a.access_token, {
      method: "GET",
      query: "select=id&limit=1",
    });
    const typeA = await rest("type", a.access_token, {
      method: "GET",
      query: "select=id&limit=1",
    });
    const classRows = classA.json as { id: number }[];
    const typeRows = typeA.json as { id: number }[];
    test.skip(
      !classRows[0] || !typeRows[0],
      "User A precisa de pelo menos 1 type e 1 class"
    );

    const stamp = `RLS-A-${Date.now()}`;
    const txInsert = await rest("transaction", a.access_token, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: a.user.id,
        class_id: classRows[0].id,
        value: 11.11,
        description: stamp,
        transaction_at: new Date().toISOString().slice(0, 10),
      }),
    });
    expect(txInsert.res.ok, txInsert.text).toBeTruthy();
    const txId = (txInsert.json as { id: number }[])[0]?.id;
    expect(txId).toBeTruthy();

    const month = new Date().toISOString().slice(0, 7) + "-01";
    const budgetInsert = await rest("monthly_budget", a.access_token, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: a.user.id,
        type_id: typeRows[0].id,
        class_id: null,
        budget_month: month,
        planned_value: 123,
      }),
    });
    expect(budgetInsert.res.ok, budgetInsert.text).toBeTruthy();
    const budgetId = (budgetInsert.json as { id: number }[])[0]?.id;
    expect(budgetId).toBeTruthy();

    // B não vê tx de A
    const bSeesTx = await rest("transaction", b.access_token, {
      method: "GET",
      query: `select=id,description&id=eq.${txId}`,
    });
    expect(bSeesTx.res.ok).toBeTruthy();
    expect(bSeesTx.json as unknown[]).toEqual([]);

    // B não deleta tx de A
    const bDeleteTx = await rest("transaction", b.access_token, {
      method: "DELETE",
      query: `id=eq.${txId}`,
    });
    expect(bDeleteTx.res.ok).toBeTruthy();
    const aStillHas = await rest("transaction", a.access_token, {
      method: "GET",
      query: `select=id&id=eq.${txId}`,
    });
    expect((aStillHas.json as unknown[]).length).toBe(1);

    // B não vê budget de A
    const bSeesBudget = await rest("monthly_budget", b.access_token, {
      method: "GET",
      query: `select=id&id=eq.${budgetId}`,
    });
    expect(bSeesBudget.res.ok).toBeTruthy();
    expect(bSeesBudget.json as unknown[]).toEqual([]);

    // Cleanup A
    await rest("transaction", a.access_token, {
      method: "DELETE",
      query: `id=eq.${txId}`,
    });
    await rest("monthly_budget", a.access_token, {
      method: "DELETE",
      query: `id=eq.${budgetId}`,
    });
  });
});
