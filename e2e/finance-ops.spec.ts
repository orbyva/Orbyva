import { expect, test } from "@playwright/test";
import {
  dismissOnboardingIfPresent,
  e2eEnv,
  rest,
  signInViaSupabaseApi,
} from "./helpers/auth";
import { E2eCleanup, e2eStamp, firstId } from "./helpers/cleanup";

const env = e2eEnv();

/** Mês civil local (mesmo critério da tela de Orçamento), evita UTC vs fuso. */
function localBudgetMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function pickClassId(token: string): Promise<number | null> {
  const { res, json } = await rest("class", token, {
    method: "GET",
    query: "select=id&limit=1",
  });
  if (!res.ok) return null;
  return (json as { id: number }[])[0]?.id ?? null;
}

/** Prefere classe de Despesa (aba padrão do orçamento). Sem fallback para Receita. */
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
  const row = preferred ?? expenses[0];
  return row
    ? { id: row.id, type_id: row.type_id, name: row.name }
    : null;
}

test.describe("orçamento e parcelas", () => {
  test.skip(!env.hasAuth, "Credenciais E2E ausentes");

  test("vê orçamento do mês na UI", async ({ page }) => {
    const session = await signInViaSupabaseApi(page);
    const cleanup = new E2eCleanup(session.access_token);
    const klass = await pickExpenseClass(session.access_token);
    test.skip(!klass, "Sem classe de Despesa no usuário E2E");

    const month = localBudgetMonth();
    // Valor raro na UI (R$ 777,77), evita colisão com seed real.
    const stamp = 777.77;
    const amountRe = /777[,.]77/;

    try {
      // Orçamento no tipo (class_id null), mesmo padrão do activation e da aba Despesas.
      const existing = await rest("monthly_budget", session.access_token, {
        method: "GET",
        query: `select=id,planned_value&type_id=eq.${klass!.type_id}&class_id=is.null&budget_month=eq.${month}&limit=1`,
      });
      const existingRow = (
        existing.json as { id: number; planned_value: number }[] | null
      )?.[0];

      if (existingRow) {
        cleanup.trackBudgetRestore(existingRow.id, Number(existingRow.planned_value));
        const patched = await rest("monthly_budget", session.access_token, {
          method: "PATCH",
          query: `id=eq.${existingRow.id}`,
          body: JSON.stringify({ planned_value: stamp }),
        });
        expect(patched.res.ok, patched.text).toBeTruthy();
      } else {
        const created = await rest("monthly_budget", session.access_token, {
          method: "POST",
          body: JSON.stringify({
            user_id: session.user.id,
            type_id: klass!.type_id,
            class_id: null,
            budget_month: month,
            planned_value: stamp,
          }),
        });
        expect(created.res.ok, created.text).toBeTruthy();
        cleanup.trackBudget(firstId(created.json));
      }

      await page.goto("/finance/budget");
      await dismissOnboardingIfPresent(page);
      await expect(page.locator("body")).toContainText(/Orçamento|orçamento/i, {
        timeout: 20_000,
      });
      await expect(page.getByText(/Carregando orçamento/i)).toHaveCount(0, {
        timeout: 20_000,
      });

      const despesasTab = page.getByRole("tab", { name: /Despesas/i });
      if (await despesasTab.isVisible().catch(() => false)) {
        await despesasTab.click();
      }

      const amount = page.getByText(amountRe).first();
      if (!(await amount.isVisible().catch(() => false))) {
        const receitasTab = page.getByRole("tab", { name: /Receitas/i });
        if (await receitasTab.isVisible().catch(() => false)) {
          await receitasTab.click();
        }
      }

      await expect(page.getByText(amountRe).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await cleanup.run();
    }
  });

  test("lista parcela/recorrência criada via API", async ({ page }) => {
    const session = await signInViaSupabaseApi(page);
    const cleanup = new E2eCleanup(session.access_token);
    const classId = await pickClassId(session.access_token);
    test.skip(!classId, "Sem classes no usuário E2E");

    const stamp = e2eStamp("REC");
    try {
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
      cleanup.trackRecurring(firstId(created.json));

      await page.goto("/finance/recurring");
      await dismissOnboardingIfPresent(page);
      await expect(page.getByText(stamp).first()).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await cleanup.run();
    }
  });
});

test.describe("exclusão e export", () => {
  test.skip(!env.hasAuth, "Credenciais E2E ausentes");

  test("exclui transação e some da lista", async ({ page }) => {
    const session = await signInViaSupabaseApi(page);
    const cleanup = new E2eCleanup(session.access_token);
    const classId = await pickClassId(session.access_token);
    test.skip(!classId, "Sem classes no usuário E2E");

    const stamp = e2eStamp("DEL");
    try {
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
      const id = firstId(tx.json);
      expect(id).toBeTruthy();
      cleanup.trackTx(id);

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
    } finally {
      await cleanup.run();
    }
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
