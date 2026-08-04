import { expect, test, type Page } from "@playwright/test";
import {
  dismissOnboardingIfPresent,
  e2eEnv,
  signInViaSupabaseApi,
} from "./helpers/auth";

const env = e2eEnv();

test.describe("ativação autenticada", () => {
  test.skip(
    !env.hasAuth,
    "Defina E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY"
  );

  test("login API e chega ao app", async ({ page }: { page: Page }) => {
    await signInViaSupabaseApi(page);
    await page.goto("/home");
    await expect(page).toHaveURL(/\/(home|finance|account)/, {
      timeout: 30_000,
    });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("abre lançamentos / transações", async ({ page }) => {
    await signInViaSupabaseApi(page);
    await page.goto("/home");
    await dismissOnboardingIfPresent(page);

    await page.goto("/finance/transactions");
    await expect(page).toHaveURL(/\/finance\/transactions/);
    await expect(page.locator("body")).toContainText(
      /Transaç|Nova|Adicionar|Registrar|Acesso expirado/i
    );
  });
});
