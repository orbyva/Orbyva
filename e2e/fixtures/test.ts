import { test as base, expect, type Page } from "@playwright/test";
import {
  e2eEnv,
  signInViaSupabaseApi,
  type SupabaseSession,
} from "../helpers/auth";
import { E2eCleanup } from "../helpers/cleanup";

/**
 * `test` estendido do projeto. Tira dos specs três coisas que, repetidas à mão,
 * viram divergência: login, limpeza de massa e coleta de erro de runtime.
 *
 * Uso:
 *   import { test, expect } from "../fixtures/test";
 *   test("...", async ({ authedPage, session, cleanup }) => { ... })
 *
 * `cleanup` roda sozinho no teardown — não precisa de try/finally no spec.
 */

export type Diagnostics = {
  /** Exceções não capturadas (`pageerror`). Zero tolerância. */
  pageErrors: string[];
  /** `console.error` já filtrado pelo allowlist abaixo. */
  consoleErrors: string[];
};

/**
 * Ruído conhecido que não indica defeito de produto. Toda entrada precisa de
 * motivo — allowlist sem justificativa é como desligar o teste.
 */
const IGNORED_CONSOLE = [
  /Failed to load resource/i, // 4xx de terceiro (analytics/ícone) não quebra tela
  /sentry/i, // SDK reclama de DSN ausente no build de teste
  /posthog/i, // idem
  /Download the React DevTools/i,
  /\[vite\]/i, // HMR do preview
];

type Fixtures = {
  diagnostics: Diagnostics;
  session: SupabaseSession;
  authedPage: Page;
  cleanup: E2eCleanup;
};

export const test = base.extend<Fixtures>({
  // Auto: toda página coleta erro de runtime, mesmo em spec que não assere.
  diagnostics: [
    async ({ page }, use) => {
      const diagnostics: Diagnostics = { pageErrors: [], consoleErrors: [] };

      page.on("pageerror", (err) => {
        diagnostics.pageErrors.push(err.message);
      });
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
        diagnostics.consoleErrors.push(text);
      });

      await use(diagnostics);
    },
    { auto: true },
  ],

  session: async ({ page }, use) => {
    const env = e2eEnv();
    if (!env.hasAuth) {
      throw new Error(
        "Fixture `session` exige E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. " +
          "Use `test.skip(!e2eEnv().hasAuth, ...)` no describe."
      );
    }
    await use(await signInViaSupabaseApi(page));
  },

  authedPage: async ({ page, session }, use) => {
    void session; // ordem: sessão gravada no localStorage antes do primeiro goto
    await use(page);
  },

  cleanup: async ({ session }, use) => {
    const cleanup = new E2eCleanup(session.access_token);
    try {
      await use(cleanup);
    } finally {
      await cleanup.run();
    }
  },
});

export { expect };

/** Nenhuma exceção não capturada rodou na página. */
export function expectNoPageErrors(diagnostics: Diagnostics) {
  expect(diagnostics.pageErrors, "exceções não capturadas na página").toEqual(
    []
  );
}

/**
 * O gate de plano do AdminLayout manda toda rota privada para
 * `/account?trial=expired`. Sem esta checagem a suíte inteira falha com
 * "heading não encontrado" e esconde a causa real.
 */
export async function expectNotTrialGated(page: Page) {
  const url = page.url();
  expect(
    url.includes("trial=expired"),
    "Conta E2E com trial/plano expirado — renove o plano do usuário de teste"
  ).toBeFalsy();
}
