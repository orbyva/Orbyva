import {
  expect,
  expectNoPageErrors,
  expectNotTrialGated,
  test,
} from "../fixtures/test";
import { dismissOnboardingIfPresent, e2eEnv } from "../helpers/auth";
import {
  APP_REDIRECTS,
  APP_ROUTES,
  ERROR_BOUNDARY_HEADING,
} from "../helpers/routes";

/**
 * Uma volta por todas as telas do app: renderizou o `<h1>` certo, não caiu no
 * ErrorBoundary e não lançou exceção.
 *
 * É o spec de maior cobertura por linha do repositório — a maioria das quebras
 * de import, hook e query aparece aqui antes de virar tela branca em produção.
 * Rota nova só precisa de uma linha em `helpers/routes.ts`.
 */
const env = e2eEnv();

test.describe("smoke de rotas do app", { tag: ["@smoke", "@critical"] }, () => {
  test.skip(!env.hasAuth, "Credenciais E2E ausentes");

  for (const route of APP_ROUTES) {
    test(`${route.path} renderiza sem erro [${route.module}]`, async ({
      authedPage: page,
      diagnostics,
    }) => {
      await page.goto(route.path);
      // Espera embutida de ~1,5s — também dá tempo do redirect de plano ocorrer.
      await dismissOnboardingIfPresent(page);
      await expectNotTrialGated(page);

      await expect(
        page.getByRole("heading", { level: 1, name: route.heading })
      ).toBeVisible({ timeout: 20_000 });

      await expect(
        page.getByRole("heading", { name: ERROR_BOUNDARY_HEADING })
      ).toHaveCount(0);

      await expect(page).toHaveURL(new RegExp(`${route.path}$`));
      expectNoPageErrors(diagnostics);
    });
  }

  for (const redirect of APP_REDIRECTS) {
    test(`${redirect.from} redireciona para a rota atual`, async ({
      authedPage: page,
    }) => {
      await page.goto(redirect.from);
      await expect(page).toHaveURL(redirect.to, { timeout: 20_000 });
    });
  }
});
