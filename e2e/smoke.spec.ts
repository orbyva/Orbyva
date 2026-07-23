import { expect, test } from "@playwright/test";

test.describe("smoke público", () => {
  test("landing carrega com marca e CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Orbyva" }).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /órbita/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Começar grátis|Abrir app/i }).first()
    ).toBeVisible();
  });

  test("landing mostra planos com preço Pro", async ({ page }) => {
    await page.goto("/#planos");
    await expect(page.getByText("R$ 19,90/mês").first()).toBeVisible();
  });

  test("termos e privacidade abrem", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /Termos/i })).toBeVisible();

    await page.goto("/privacy");
    await expect(
      page.getByRole("heading", { name: /Privacidade/i })
    ).toBeVisible();
  });

  test("login mostra Continuar com Google", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: /Continuar com Google/i })
    ).toBeVisible();
  });
});
