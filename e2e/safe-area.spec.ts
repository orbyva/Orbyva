import { devices, expect, test } from "@playwright/test";

import { signInViaSupabaseApi } from "./helpers/auth";
import {
  INSET_BOTTOM,
  INSET_TOP,
  probeSafeAreaInsets,
  rectOf,
  setSafeAreaInsets,
  skipUnlessAuthUsable,
} from "./helpers/safe-area";

/**
 * iPhone 14 emulado, mas **no Chromium**: `devices["iPhone 14"]` traz
 * `defaultBrowserType: "webkit"`, e `Emulation.setSafeAreaInsetsOverride` (CDP) só existe no
 * Chromium. O device entra aqui pela viewport/UA/touch, não pelo motor.
 */
test.use({ ...devices["iPhone 14"], defaultBrowserType: "chromium" });

test.describe("safe area — instrumento (CDP)", () => {
  test("override de CDP faz env(safe-area-inset-top) valer 59px", async ({
    page,
  }) => {
    await setSafeAreaInsets(page, { top: INSET_TOP, bottom: INSET_BOTTOM });
    await page.goto("/login");

    const measured = await probeSafeAreaInsets(page);
    expect(measured.top).toBe(`${INSET_TOP}px`);
    expect(measured.bottom).toBe(`${INSET_BOTTOM}px`);
  });

  test("sem override, env(safe-area-inset-top) vale 0px", async ({ page }) => {
    await page.goto("/login");

    const measured = await probeSafeAreaInsets(page);
    expect(measured.top).toBe("0px");
    expect(measured.bottom).toBe("0px");
  });
});

test.describe("safe area — shell do admin", () => {
  /**
   * `main` casa o `<main>` do `SidebarInset` (`src/components/ui/sidebar.tsx:322`): é o primeiro
   * `<main>` do documento, antes do `<main>` do `PageShell` que o `Outlet` renderiza dentro dele.
   */
  const SHELL = "main";
  const TRIGGER = 'button[data-sidebar="trigger"]';

  test.beforeEach(async () => {
    await skipUnlessAuthUsable();
  });

  test("com override, o shell desce o inset e o gatilho do menu fica alcançável", async ({
    page,
  }) => {
    // Override ANTES de `signInViaSupabaseApi`, que já faz `page.goto("/login")` por dentro.
    await setSafeAreaInsets(page, { top: INSET_TOP, bottom: INSET_BOTTOM });
    await signInViaSupabaseApi(page);
    await page.goto("/home");
    await page.locator(TRIGGER).waitFor({ state: "visible" });

    const paddingTop = await page.evaluate(
      (sel) => getComputedStyle(document.querySelector(sel)!).paddingTop,
      SHELL
    );
    expect(paddingTop).toBe(`${INSET_TOP}px`);

    // A asserção que fecha literalmente o relato: "não dá pra acessar a navegação superior".
    const trigger = await rectOf(page, TRIGGER);
    expect(trigger.top).toBeGreaterThanOrEqual(INSET_TOP);
  });

  test("sem override, o shell volta a padding 0 e o gatilho encosta no topo", async ({
    page,
  }) => {
    await signInViaSupabaseApi(page);
    await page.goto("/home");
    await page.locator(TRIGGER).waitFor({ state: "visible" });

    const paddingTop = await page.evaluate(
      (sel) => getComputedStyle(document.querySelector(sel)!).paddingTop,
      SHELL
    );
    expect(paddingTop).toBe("0px");

    const trigger = await rectOf(page, TRIGGER);
    expect(trigger.top).toBeLessThan(INSET_TOP);
  });
});

test.describe("safe area — drawer mobile da sidebar", () => {
  const TRIGGER = 'button[data-sidebar="trigger"]';
  /** Primeiro item do drawer: o `TeamSwitcher` no `SidebarHeader` (`app-sidebar.tsx:128`). */
  const PRIMEIRO_ITEM = '[data-mobile="true"] [data-sidebar="header"]';
  /** Último item do drawer: o `NavUser` no `SidebarFooter` (`app-sidebar.tsx:137`). */
  const ULTIMO_ITEM = '[data-mobile="true"] [data-sidebar="footer"]';

  test.beforeEach(async () => {
    await skipUnlessAuthUsable();
  });

  async function abrirDrawer(page: import("@playwright/test").Page) {
    await page.goto("/home");
    await page.locator(TRIGGER).click();
    await page.locator(PRIMEIRO_ITEM).waitFor({ state: "visible" });
    // O Sheet entra com transição; sem isso o rect medido é o do estado de entrada.
    await page.waitForTimeout(400);
  }

  test("com override, o drawer respeita a status bar e o home indicator", async ({
    page,
  }) => {
    await setSafeAreaInsets(page, { top: INSET_TOP, bottom: INSET_BOTTOM });
    await signInViaSupabaseApi(page);
    await abrirDrawer(page);

    const primeiro = await rectOf(page, PRIMEIRO_ITEM);
    expect(primeiro.top).toBeGreaterThanOrEqual(INSET_TOP);

    // Metade "home indicator" da decisão: o NavUser não pode encostar na barrinha.
    const ultimo = await rectOf(page, ULTIMO_ITEM);
    const altura = await page.evaluate(() => window.innerHeight);
    expect(ultimo.bottom).toBeLessThanOrEqual(altura - INSET_BOTTOM);
  });

  test("sem override, o drawer encosta no topo como antes", async ({ page }) => {
    await signInViaSupabaseApi(page);
    await abrirDrawer(page);

    const primeiro = await rectOf(page, PRIMEIRO_ITEM);
    expect(primeiro.top).toBeLessThan(INSET_TOP);
  });
});

test.describe("safe area — superfícies públicas", () => {
  /** O header-pílula: primeiro filho do `<header>` em cada uma das três telas. */
  const PILULA = "header > div";
  const ROTAS = ["/login", "/", "/terms"];

  for (const rota of ROTAS) {
    test(`com override, a pílula de ${rota} fica abaixo da status bar`, async ({
      page,
    }) => {
      await setSafeAreaInsets(page, { top: INSET_TOP, bottom: INSET_BOTTOM });
      await page.goto(rota);
      await page.locator(PILULA).first().waitFor({ state: "visible" });

      const pilula = await rectOf(page, PILULA);
      expect(pilula.top).toBeGreaterThanOrEqual(INSET_TOP);
    });

    test(`sem override, a pílula de ${rota} volta ao espaçamento de antes`, async ({
      page,
    }) => {
      await page.goto(rota);
      await page.locator(PILULA).first().waitFor({ state: "visible" });

      const pilula = await rectOf(page, PILULA);
      expect(pilula.top).toBeLessThan(INSET_TOP);
    });
  }
});
