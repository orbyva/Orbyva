import { expect, test } from "@playwright/test";
import {
  dismissOnboardingIfPresent,
  e2eEnv,
  signInViaSupabaseApi,
} from "./helpers/auth";

const env = e2eEnv();

test.describe("offline outbox na UI", () => {
  test.skip(!env.hasAuth, "Credenciais E2E ausentes");

  test("mostra banner com lançamentos pendentes na fila", async ({ page }) => {
    await signInViaSupabaseApi(page);
    await page.goto("/home");
    await dismissOnboardingIfPresent(page);

    await page.evaluate(() => {
      localStorage.setItem(
        "orbyva_outbox_v1",
        JSON.stringify([
          {
            id: "e2e-pending-1",
            createdAt: new Date().toISOString(),
            kind: "transaction",
            payload: {
              class_id: -1,
              value: 1,
              description: "E2E pending offline",
              transaction_at: "2026-07-26",
            },
          },
        ])
      );
    });

    await page.reload();
    await dismissOnboardingIfPresent(page);

    await expect(
      page.getByText(/aguardando sincronização|na fila/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });
});
