import { expect, test } from "@playwright/test";
import {
  APP_ROUTES,
  GUARDED_ONLY_ROUTES,
  PUBLIC_ROUTES,
} from "../helpers/routes";

/**
 * Guarda de rotas, sem sessão. Não depende de credencial nem de massa, então
 * roda em qualquer ambiente — inclusive em fork sem secret.
 *
 * O que protege: rota privada que vaza para anônimo (dado exposto) e rota
 * pública que passa a exigir login (landing e legal quebradas para visitante).
 */

test.describe("guarda de rotas", { tag: ["@smoke", "@critical"] }, () => {
  for (const path of [...APP_ROUTES.map((r) => r.path), ...GUARDED_ONLY_ROUTES]) {
    test(`${path} sem sessão manda para /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
    });
  }

  for (const path of PUBLIC_ROUTES.filter((p) => p !== "/login")) {
    test(`${path} abre sem sessão`, async ({ page }) => {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login$/);
      // Não basta a URL: a guarda poderia renderizar o login sem navegar.
      await expect(
        page.getByRole("button", { name: /Continuar com Google/i })
      ).toHaveCount(0);
    });
  }

  test("rota inexistente mostra 404", async ({ page }) => {
    await page.goto("/rota-que-nao-existe-e2e");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Página não encontrada/i })
    ).toBeVisible();
  });
});
