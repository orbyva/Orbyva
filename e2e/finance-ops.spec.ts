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

/** Prefere classe de Despesa (aba padrão do orçamento). */
async function pickExpenseClass(
  token: string
): Promise<{ id: number; type_id: number; name: string } | null> {
  const { res, json } = await rest("class", token, {
    method: "GET",
    query:
      "select=id,type_id,name,type:type_id(nature:nature_id(name))&limit=100",
  });
  if (!res.ok) return null;
  type Row = {
    id: number;
    type_id: number;
    name: string;
    type?: { nature?: { name?: string } | null } | null;
  };
  const rows = (json as Row[]) ?? [];
  const expenses = rows.filter((r) =>
    /despesa/i.test(r.type?.nature?.name ?? "")
  );
  const preferred = expenses.find((r) =>
    /^(Delivery|Mercado|Manutenção|Cinema)$/i.test(r.name)
  );
  const row = preferred ?? expenses[0] ?? rows[0];
  return row
    ? { id: row.id, type_id: row.type_id, name: row.name }
    : null;
}

test.describe("orçamento e parcelas", () => {
  test.skip(!env.hasAuth, "Credenciais E2E ausentes");

  test("vê orçamento do mês na UI", async ({ page }) => {
    const session = await signInViaSupabaseApi(page);
    const klass = await pickExpenseClass(session.access_token);
    test.skip(!klass, "Sem classes/dimensões no usuário E2E");

    const month = new Date().toISOString().slice(0, 7) + "-01";
    // Valor raro na UI formatada (R$ 777,77) — evita colisão com seed real.
    const stamp = 777.77;

    const existing = await rest("monthly_budget", session.access_token, {
      method: "GET",
      query: `select=id&class_id=eq.${klass!.id}&budget_month=eq.${month}&limit=1`,
    });
    const existingId = (existing.json as { id: number }[] | null)?.[0]?.id;

    if (existingId) {
      const patched = await rest("monthly_budget", session.access_token, {
        method: "PATCH",
        query: `id=eq.${existingId}`,
        body: JSON.stringify({ planned_value: stamp }),
      });
      expect(patched.res.ok, patched.text).toBeTruthy();
    } else {
      const created = await rest("monthly_budget", session.access_token, {
        method: "POST",
        body: JSON.stringify({
          user_id: session.user.id,
          type_id: klass!.type_id,
          class_id: klass!.id,
          budget_month: month,
          planned_value: stamp,
        }),
      });
      expect(created.res.ok, created.text).toBeTruthy();
    }

    await page.goto("/finance/budget");
    await dismissOnboardingIfPresent(page);
    await expect(page.locator("body")).toContainText(/Orçamento|orçamento/i, {
      timeout: 20_000,
    });
    // Garante aba certa se a classe cair em receita.
    const receitas = page.getByRole("tab", { name: /Receitas/i });
    if (await receitas.isVisible().catch(() => false)) {
      // Tenta Despesas primeiro (padrão); se não achar, troca.
      const found = await page
        .locator("body")
        .getByText(/777,77/)
        .first()
        .isVisible()
        .catch(() => false);
      if (!found) {
        await receitas.click();
      }
    }
    await expect(page.getByText(/777,77/).first()).toBeVisible({
      timeout: 15_000,
    });
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
    const exportSection = page
      .locator("section")
      .filter({ hasText: /Exportar dados/i });
    await expect(
      exportSection.getByRole("heading", { name: /Exportar dados/i })
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      exportSection.getByRole("button", { name: "Finanças", exact: true })
    ).toBeVisible({ timeout: 10_000 });
  });
});
