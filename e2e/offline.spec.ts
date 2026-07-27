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

    // Injeta fila + dispara offline no documento (sem cortar localhost).
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
      window.dispatchEvent(new Event("offline"));
    });

    await expect(page.getByTestId("offline-banner")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("offline-banner")).toContainText(
      /na fila|offline/i
    );
  });
});
