import { test, type Page } from "@playwright/test";

import { e2eEnv } from "./auth";

/**
 * Override de safe area por CDP — a única forma de fazer `env(safe-area-inset-*)` valer >0 no
 * Chromium. Emular o iPhone 14 (`devices["iPhone 14"]`) dá o tamanho da viewport e o user agent,
 * mas **não** os insets: sem este override o `env()` resolve 0 e toda asserção de inset passaria
 * por acidente (ou falharia sem dizer por quê).
 *
 * ORDEM IMPORTA: `Emulation.setSafeAreaInsetsOverride` tem de ser chamado **antes da primeira
 * navegação da página**. O override persiste pelas navegações seguintes do mesmo target, mas não
 * é aplicado retroativamente ao documento já carregado.
 *
 * Atenção com o login: `signInViaSupabaseApi` (`e2e/helpers/auth.ts:77`) faz um
 * `page.goto("/login")` por dentro para gravar a sessão no `localStorage` — ou seja, **ele já é
 * uma navegação**. Logo a ordem correta é:
 *
 *   await setSafeAreaInsets(page, { top: INSET_TOP, bottom: INSET_BOTTOM });
 *   await signInViaSupabaseApi(page);
 *   await page.goto("/home");
 */

/** Inset de topo do iPhone 14 em retrato (Dynamic Island), em px CSS. */
export const INSET_TOP = 59;

/** Inset de base do iPhone 14 em retrato (home indicator), em px CSS. */
export const INSET_BOTTOM = 34;

export type SafeAreaInsets = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

/**
 * Aplica os insets informados na página (os omitidos vão como 0).
 * Chamar antes do primeiro `goto` da página — ver bloco acima.
 */
export async function setSafeAreaInsets(
  page: Page,
  insets: SafeAreaInsets
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: {
      top: insets.top ?? 0,
      bottom: insets.bottom ?? 0,
      left: insets.left ?? 0,
      right: insets.right ?? 0,
    },
  });
}

/**
 * Mede `padding-top`/`padding-bottom` que o próprio `env(safe-area-inset-*)` produz, via sonda
 * injetada com `addStyleTag`. É o teste-guarda do instrumento: sem ele, uma asserção vermelha mais
 * à frente é ambígua (fix quebrado vs. override que não chegou).
 */
export async function probeSafeAreaInsets(
  page: Page
): Promise<{ top: string; bottom: string }> {
  await page.addStyleTag({
    content: `
      #safe-area-probe {
        position: fixed;
        inset: 0 auto auto 0;
        padding-top: env(safe-area-inset-top, 0px);
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }
    `,
  });
  await page.evaluate(() => {
    if (document.getElementById("safe-area-probe")) return;
    const probe = document.createElement("div");
    probe.id = "safe-area-probe";
    document.body.appendChild(probe);
  });
  return page.evaluate(() => {
    const probe = document.getElementById("safe-area-probe")!;
    const style = getComputedStyle(probe);
    return { top: style.paddingTop, bottom: style.paddingBottom };
  });
}

/** `getBoundingClientRect()` de um seletor, já serializado. */
export async function rectOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Seletor não encontrado: ${sel}`);
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
  }, selector);
}

let supabaseReachable: boolean | null = null;

/**
 * `hasAuth` só confere se as variáveis existem — não se o host responde. Em máquina sem acesso ao
 * projeto Supabase (DNS NXDOMAIN, rede fechada), `signInViaSupabaseApi` estoura num erro de rede e
 * o caso autenticado aparece como FALHA de feature, quando é falta de ambiente. Esta sonda
 * transforma esse caso em `skipped`, igual à ausência de credencial.
 */
export async function skipUnlessAuthUsable(): Promise<void> {
  const env = e2eEnv();
  test.skip(!env.hasAuth, "Credenciais E2E ausentes");

  if (supabaseReachable === null) {
    try {
      const res = await fetch(`${env.supabaseUrl}/auth/v1/health`, {
        signal: AbortSignal.timeout(8_000),
      });
      supabaseReachable = res.status < 500;
    } catch {
      supabaseReachable = false;
    }
  }

  test.skip(
    !supabaseReachable,
    `Host Supabase inacessível neste ambiente (${env.supabaseUrl})`
  );
}
