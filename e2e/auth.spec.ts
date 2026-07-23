import { expect, test } from "@playwright/test";

/**
 * Fluxo autenticado (e-mail/senha).
 * Pula no CI se E2E_EMAIL / E2E_PASSWORD não estiverem definidos.
 *
 * No Supabase: Authentication → Providers → Email habilitado.
 * Crie um usuário de teste (ou use signUp uma vez).
 */
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const hasAuth = Boolean(email && password);

test.describe("ativação autenticada", () => {
  test.skip(!hasAuth, "Defina E2E_EMAIL e E2E_PASSWORD para rodar");

  test("login e-mail e chega ao app", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email!);
    await page.getByLabel("Senha").fill(password!);
    await page.getByRole("button", { name: /Entrar com e-mail/i }).click();

    await expect(page).toHaveURL(/\/(home|finance)/, { timeout: 30_000 });
  });

  test("abre ledger de transações", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email!);
    await page.getByLabel("Senha").fill(password!);
    await page.getByRole("button", { name: /Entrar com e-mail/i }).click();
    await expect(page).toHaveURL(/\/(home|finance)/, { timeout: 30_000 });

    const skip = page.getByRole("button", { name: /Pular/i });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
    }

    await page.goto("/finance/transactions");
    await expect(page).toHaveURL(/\/finance\/transactions/);
    await expect(page.locator("body")).toContainText(/Transaç|Nova|Adicionar|Registrar/i);
  });
});
