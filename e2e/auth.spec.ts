import { expect, test, type Page } from "@playwright/test";

/**
 * Fluxo autenticado (e-mail/senha).
 * Pula se E2E_EMAIL / E2E_PASSWORD / VITE_SUPABASE_* não estiverem definidos.
 *
 * Preferência: login via API do Supabase (estável no CI), depois valida a UI.
 * Usuário precisa existir e estar confirmado (Auth → Users).
 */
const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD?.trim();
const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, "");
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const hasAuth = Boolean(email && password && supabaseUrl && supabaseAnonKey);

async function signInViaSupabaseApi(page: Page) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey!,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Login Supabase falhou (${res.status}): ${bodyText}\n` +
        "Confira E2E_EMAIL/E2E_PASSWORD, usuário confirmado e secrets VITE_SUPABASE_*."
    );
  }

  const session = JSON.parse(bodyText) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    expires_at?: number;
    token_type?: string;
    user: unknown;
  };

  const projectRef = new URL(supabaseUrl!).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  await page.goto("/login");
  await page.evaluate(
    ({ storageKey, session }) => {
      const expiresAt =
        session.expires_at ??
        Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600);
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: expiresAt,
          expires_in: session.expires_in ?? 3600,
          token_type: session.token_type ?? "bearer",
          user: session.user,
        })
      );
    },
    { storageKey, session }
  );
}

test.describe("ativação autenticada", () => {
  test.skip(
    !hasAuth,
    "Defina E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY"
  );

  test("login API e chega ao app", async ({ page }) => {
    await signInViaSupabaseApi(page);
    await page.goto("/home");
    await expect(page).toHaveURL(/\/(home|finance|account)/, {
      timeout: 30_000,
    });
    // Não deve voltar ao login
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("abre ledger de transações", async ({ page }) => {
    await signInViaSupabaseApi(page);
    await page.goto("/home");

    const skip = page.getByRole("button", { name: /Pular/i });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
    }

    await page.goto("/finance/transactions");
    await expect(page).toHaveURL(/\/finance\/transactions/);
    await expect(page.locator("body")).toContainText(
      /Transaç|Nova|Adicionar|Registrar|Acesso expirado/i
    );
  });
});
