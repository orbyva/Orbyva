import { expect, test } from "@playwright/test";

test.describe("smoke público", () => {
  test("landing carrega com marca e CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Orbyva" }).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /cabe no mês|órbita|organize/i }).first()
    ).toBeVisible();
    // Sem Stripe no CI → "Entrar na lista"; com billing → Começar/Abrir app
    await expect(
      page
        .getByRole("link", {
          name: /Começar grátis|Abrir app|Entrar na lista/i,
        })
        .first()
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

  test("login mostra Google e e-mail", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: /Continuar com Google/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Entrar com e-mail/i })
    ).toBeVisible();
  });

  test("página Sobre descreve o produto", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: /Sobre|Orbyva/i }).first()).toBeVisible();
    await expect(page.getByText(/Finanças|orçamento/i).first()).toBeVisible();
  });

  test("landing FAQ está acessível", async ({ page }) => {
    await page.goto("/#faq");
    await expect(page.locator("#faq")).toBeVisible();
  });
});
